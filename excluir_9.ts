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
    where: { name: "JOSE ROBERTO AUGUSTO" },
  });
  if (!customer) {
    console.log("Cliente não encontrado.");
    return;
  }

  const allAguardando = await prisma.inspection.findMany({
    where: {
      customerId: customer.id,
      status: "AGUARDANDO",
      nfseNumber: null,
    },
    include: { vehicle: true },
    orderBy: { date: "asc" },
  });

  const toDelete = allAguardando.filter((i) => i.vehicle?.plate === "EHUJ77");

  console.log(`Serão excluídas ${toDelete.length} inspeções EHUJ77:`);
  for (const i of toDelete) {
    console.log(`${i.id} | ${i.date.toISOString().slice(0, 10)} | ${i.vehicle?.plate ?? "n/a"}`);
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
    where: { id: { in: toDelete.map((i) => i.id) } },
  });

  console.log(`\nPronto. ${count} inspeções excluídas.`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
