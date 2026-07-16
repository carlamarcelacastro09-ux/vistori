import { prisma } from "@/lib/db";

async function main() {
  const inspections = await prisma.inspection.findMany({
    include: { vehicle: true, job: true },
  });

  const plateGroups = new Map<string, typeof inspections>();
  for (const insp of inspections) {
    if (!insp.vehicle) continue;
    const plate = insp.vehicle.plate;
    const group = plateGroups.get(plate) || [];
    group.push(insp);
    plateGroups.set(plate, group);
  }

  const toDelete: string[] = [];
  const kept: { plate: string; status: string; nf?: string }[] = [];

  for (const [plate, group] of plateGroups.entries()) {
    if (group.length <= 1) continue;

    // Ordenar: LANCADO com NF > EMITIDA com NF > outros > mais recente primeiro
    const scored = group
      .map((insp) => ({
        insp,
        score:
          (insp.status === "LANCADO" && insp.nfseNumber ? 300 : 0) +
          (insp.status === "EMITIDA" && insp.nfseNumber ? 200 : 0) +
          (insp.status === "LANCADO" ? 100 : 0) +
          (insp.status === "EMITIDA" ? 50 : 0) +
          (insp.status === "ERRO" ? 10 : 0),
        createdAt: insp.createdAt.getTime(),
      }))
      .sort((a, b) => b.score - a.score || b.createdAt - a.createdAt);

    const best = scored[0].insp;
    kept.push({ plate, status: best.status, nf: best.nfseNumber || undefined });

    for (const item of scored.slice(1)) {
      toDelete.push(item.insp.id);
    }
  }

  console.log(`Encontradas ${plateGroups.size} placas.`);
  console.log(`Placas com duplicatas: ${kept.length}`);
  console.log(`Inspeções a remover: ${toDelete.length}`);

  if (toDelete.length === 0) {
    console.log("Nenhuma duplicata para remover.");
    return;
  }

  // Primeiro remove os jobs vinculados
  await prisma.invoiceJob.deleteMany({
    where: { inspectionId: { in: toDelete } },
  });

  // Depois remove as inspeções
  await prisma.inspection.deleteMany({
    where: { id: { in: toDelete } },
  });

  console.log(`Removidas ${toDelete.length} inspeções duplicadas.`);
  console.log("\n--- Mantidas ---");
  for (const k of kept) {
    console.log(`${k.plate}: ${k.status}${k.nf ? ` (NF:${k.nf})` : ""}`);
  }
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
