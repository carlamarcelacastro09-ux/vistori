import "dotenv/config";
import pg from "pg";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "./src/generated/prisma/client";

const { Pool } = pg;

const prisma = new PrismaClient({
  adapter: new PrismaPg(new Pool({ connectionString: process.env.DATABASE_URL })),
});

async function main() {
  const customer = await prisma.customer.findFirst({
    where: { doc: "17549971803" },
  });
  if (!customer) {
    console.log("Cliente não encontrado.");
    return;
  }

  const toDelete = await prisma.inspection.findMany({
    where: {
      customerId: customer.id,
      vehicle: { plate: "EHUJ77" },
    },
    include: { vehicle: true, job: true },
    orderBy: { date: "asc" },
  });

  console.log(`Serão excluídas ${toDelete.length} inspeções EHUJ77 de ${customer.name}:`);
  for (const i of toDelete) {
    console.log(
      `${i.id} | ${i.date.toISOString().slice(0, 10)} | ${i.status} | NF:${i.nfseNumber ?? "n/a"} | ${i.vehicle?.plate ?? "n/a"}`
    );
  }

  if (process.argv.includes("--dry-run")) {
    console.log("\nDry-run: nenhuma exclusão foi feita.");
    return;
  }

  if (toDelete.length === 0) {
    console.log("\nNada para excluir.");
    return;
  }

  const { count } = await prisma.inspection.deleteMany({
    where: {
      customerId: customer.id,
      vehicle: { plate: "EHUJ77" },
    },
  });

  console.log(`\nPronto. ${count} inspeções EHUJ77 excluídas.`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
