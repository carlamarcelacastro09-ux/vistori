import "dotenv/config";
import pg from "pg";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "./src/generated/prisma/client";

const { Pool } = pg;

const prisma = new PrismaClient({
  adapter: new PrismaPg(new Pool({ connectionString: process.env.DATABASE_URL })),
});

async function main() {
  const dryRun = process.argv.includes("--dry-run");

  const inspectionsToReset = await prisma.inspection.findMany({
    where: { status: "ERRO", nfseNumber: null },
    include: { job: true },
    orderBy: { date: "asc" },
  });

  const jobsToPause = await prisma.invoiceJob.findMany({
    where: {
      status: { in: ["FILA", "PROCESSANDO"] },
    },
    include: { inspection: { select: { id: true, status: true, nfseNumber: true } } },
    orderBy: { createdAt: "asc" },
  });

  console.log(`Serão resetadas ${inspectionsToReset.length} inspeções de ERRO para AGUARDANDO.`);
  for (const i of inspectionsToReset) {
    console.log(
      `${i.id} | ${i.date.toISOString().slice(0, 10)} | NF:${i.nfseNumber ?? "n/a"} | job:${i.job?.status ?? "n/a"}`
    );
  }

  console.log(`\nSerão pausados ${jobsToPause.length} jobs (FILA/PROCESSANDO) em ERRO.`);
  for (const j of jobsToPause) {
    console.log(`${j.id} | insp:${j.inspectionId} | status:${j.status} | tentativas:${j.attempts}`);
  }

  if (dryRun) {
    console.log("\nDry-run: nenhuma alteração foi feita.");
    return;
  }

  const inspectionIds = inspectionsToReset.map((i) => i.id);
  const jobIds = jobsToPause.map((j) => j.id);

  if (inspectionIds.length > 0) {
    await prisma.inspection.updateMany({
      where: { id: { in: inspectionIds } },
      data: { status: "AGUARDANDO", nfseNumber: null, errorMessage: null },
    });
  }

  if (jobIds.length > 0) {
    await prisma.invoiceJob.updateMany({
      where: { id: { in: jobIds } },
      data: {
        status: "ERRO",
        lastError: "Pausado pelo administrador. Aguardando liberação do site da prefeitura.",
        attempts: 0,
      },
    });
  }

  console.log(`\nPronto. ${inspectionIds.length} inspeções voltadas para AGUARDANDO e ${jobIds.length} jobs pausados.`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
