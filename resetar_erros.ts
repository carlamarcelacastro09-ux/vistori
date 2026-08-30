import "dotenv/config";
import pg from "pg";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "./src/generated/prisma/client";

const { Pool } = pg;

const prisma = new PrismaClient({
  adapter: new PrismaPg(new Pool({ connectionString: process.env.DATABASE_URL })),
});

async function main() {
  const where = {
    status: "ERRO" as const,
    errorMessage: { contains: "locator.waitFor" },
  };

  const toReset = await prisma.inspection.findMany({
    where,
    include: { job: true },
    orderBy: { date: "asc" },
  });

  console.log(`Encontradas ${toReset.length} inspeções com erro locator.waitFor`);

  if (process.argv.includes("--dry-run")) {
    for (const i of toReset) {
      console.log(
        `${i.id} | ${i.date.toISOString().slice(0, 10)} | ${i.errorMessage?.slice(0, 60) ?? ""}...`
      );
    }
    console.log("\nDry-run: nenhuma alteração foi feita.");
    return;
  }

  if (toReset.length === 0) {
    console.log("Nada para resetar.");
    return;
  }

  const { count } = await prisma.inspection.updateMany({
    where,
    data: {
      status: "AGUARDANDO",
      nfseNumber: null,
      errorMessage: null,
    },
  });

  const ids = toReset.map((i) => i.id);
  await prisma.invoiceJob.updateMany({
    where: { inspectionId: { in: ids } },
    data: { status: "FILA", lastError: null, attempts: 0 },
  });

  console.log(`\nPronto. ${count} inspeções voltadas para AGUARDANDO e erros apagados.`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
