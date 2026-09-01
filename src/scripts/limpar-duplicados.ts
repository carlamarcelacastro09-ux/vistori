import "dotenv/config";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "../generated/prisma/client";

function requiredEnv(name: string) {
  const v = process.env[name];
  if (!v) throw new Error(`Variável ${name} não configurada.`);
  return v;
}

async function main() {
  const databaseUrl = requiredEnv("DATABASE_URL");
  const dryRun = process.argv.includes("--dry-run");
  const confirm = process.argv.includes("--confirm");

  const adapter = new PrismaPg({ connectionString: databaseUrl });
  const prisma = new PrismaClient({ adapter });

  try {
    const inspections = await prisma.inspection.findMany({
      include: { vehicle: { select: { plate: true } } },
      orderBy: [{ vehicle: { plate: "asc" } }, { date: "desc" }, { createdAt: "desc" }],
    });

    const byPlate: Record<string, typeof inspections> = {};
    for (const i of inspections) {
      const plate = i.vehicle?.plate ?? "SEM-PLACA";
      if (!byPlate[plate]) byPlate[plate] = [];
      byPlate[plate].push(i);
    }

    const toRemove: string[] = [];
    const summary: { plate: string; total: number; keep: string }[] = [];

    for (const [plate, list] of Object.entries(byPlate)) {
      if (list.length <= 1) continue;

      const sorted = list.sort((a, b) => {
        const aHasNote = a.nfseNumber ? 1 : 0;
        const bHasNote = b.nfseNumber ? 1 : 0;
        if (aHasNote !== bHasNote) return bHasNote - aHasNote;
        const aDate = new Date(a.date).getTime();
        const bDate = new Date(b.date).getTime();
        if (aDate !== bDate) return bDate - aDate;
        return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();
      });

      const keep = sorted[0];
      summary.push({ plate, total: list.length, keep: keep.id });

      for (let idx = 1; idx < sorted.length; idx++) {
        toRemove.push(sorted[idx].id);
      }
    }

    if (summary.length === 0) {
      console.log("Nenhuma vistoria duplicada encontrada.");
      return;
    }

    console.log(`Placas com duplicatas: ${summary.length}`);
    console.log(`Vistorias a remover: ${toRemove.length}`);
    for (const s of summary.slice(0, 50)) {
      console.log(`  ${s.plate}: ${s.total} vistorias, mantendo ${s.keep}`);
    }
    if (summary.length > 50) {
      console.log(`  ... e mais ${summary.length - 50} placas`);
    }

    if (dryRun) {
      console.log("\nDry-run: nenhuma alteração foi feita.");
      return;
    }

    if (!confirm) {
      console.log("\nPara realmente excluir, rode com a flag --confirm");
      console.log("Recomendação: primeiro rode com --dry-run para conferir.");
      return;
    }

    const batchSize = 50;
    let removed = 0;
    for (let i = 0; i < toRemove.length; i += batchSize) {
      const batch = toRemove.slice(i, i + batchSize);
      await prisma.$transaction([
        prisma.invoiceJob.deleteMany({ where: { inspectionId: { in: batch } } }),
        prisma.inspection.deleteMany({ where: { id: { in: batch } } }),
      ]);
      removed += batch.length;
      console.log(`Removidas ${removed}/${toRemove.length}...`);
    }

    console.log(`\nLimpeza concluída. ${removed} vistorias duplicadas removidas.`);
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
