import "dotenv/config";
import { prisma } from "../lib/db";

async function main() {
  const soE0014 = process.argv.includes("--e0014");
  const dryRun = process.argv.includes("--dry-run");

  const where = soE0014
    ? { status: "ERRO" as const, errorMessage: { contains: "E0014" } }
    : { status: "ERRO" as const };

  const jobs = await prisma.invoiceJob.findMany({
    where,
    include: { inspection: true },
  });

  console.log(`Jobs em ERRO encontrados: ${jobs.length} (${soE0014 ? "somente E0014" : "todos"})`);

  if (dryRun) {
    console.log("DRY RUN — nenhuma alteração será feita");
    for (const j of jobs) {
      console.log(`  ${j.id} | inspeção ${j.inspectionId} | attempts ${j.attempts} | ${j.lastError?.slice(0, 80)}`);
    }
    return;
  }

  for (const j of jobs) {
    await prisma.$transaction([
      prisma.invoiceJob.update({
        where: { id: j.id },
        data: { status: "FILA", attempts: 0, lastError: null },
      }),
      prisma.inspection.update({
        where: { id: j.inspectionId },
        data: { status: "AGUARDANDO", errorMessage: null, nfseNumber: null },
      }),
    ]);
    console.log(`  Reset: ${j.id} | inspeção ${j.inspectionId}`);
  }

  console.log(`\n${jobs.length} job(s) resetado(s) para FILA.`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
