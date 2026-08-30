import "dotenv/config";
import pg from "pg";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "./src/generated/prisma/client";

const { Pool } = pg;

const prisma = new PrismaClient({
  adapter: new PrismaPg(new Pool({ connectionString: process.env.DATABASE_URL })),
});

async function main() {
  const nfseNumber = "5778";

  const inspections = await prisma.inspection.findMany({
    where: { nfseNumber, status: "LANCADO" },
    include: { customer: true, vehicle: true },
    orderBy: { date: "asc" },
  });

  console.log(`Encontradas ${inspections.length} inspeções com nota ${nfseNumber}:`);
  for (const i of inspections) {
    const v = i.vehicle;
    console.log(
      `  ${i.id} | data=${i.date.toISOString().slice(0, 10)} | placa=${v?.plate ?? "n/a"} | modelo=${v?.model ?? "n/a"} | marca=${v?.brand ?? "n/a"} | cliente=${i.customer.name}`
    );
  }

  if (process.argv.includes("--dry-run")) {
    console.log("\nDry-run: nenhuma alteração foi feita.");
    return;
  }

  if (inspections.length === 0) {
    console.log("Nada para atualizar.");
    return;
  }

  const ids = inspections.map((i) => i.id);

  const { count } = await prisma.inspection.updateMany({
    where: { nfseNumber, status: "LANCADO" },
    data: { status: "AGUARDANDO", nfseNumber: null, errorMessage: null },
  });

  await prisma.invoiceJob.updateMany({
    where: { inspectionId: { in: ids } },
    data: { status: "FILA", lastError: null, attempts: 0 },
  });

  console.log(`\nPronto. ${count} inspeções voltadas para AGUARDANDO e nota apagada.`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
