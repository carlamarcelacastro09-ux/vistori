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
  const inspections = await prisma.inspection.findMany({
    where: { customerId: customer.id },
    include: { vehicle: true, job: true },
    orderBy: { date: "asc" },
  });
  console.log(`Total de inspeções para ${customer.name}: ${inspections.length}`);
  for (const i of inspections) {
    const v = i.vehicle;
    const j = i.job;
    console.log(
      `${i.id} | ${i.date.toISOString().slice(0, 10)} | ${i.status} | NF:${i.nfseNumber ?? "n/a"} | placa:${v?.plate ?? "n/a"} | job:${j?.status ?? "n/a"}`
    );
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
