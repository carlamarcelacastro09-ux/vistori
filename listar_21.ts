import "dotenv/config";
import pg from "pg";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "./src/generated/prisma/client";

const { Pool } = pg;

const prisma = new PrismaClient({
  adapter: new PrismaPg(new Pool({ connectionString: process.env.DATABASE_URL })),
});

async function main() {
  const inspections = await prisma.inspection.findMany({
    where: { status: "AGUARDANDO", nfseNumber: null },
    include: { customer: true, vehicle: true },
    orderBy: { date: "asc" },
  });

  console.log(`Total de inspeções AGUARDANDO sem nota: ${inspections.length}`);
  for (const i of inspections) {
    console.log(
      `${i.id} | ${i.date.toISOString().slice(0, 10)} | ${i.customer.doc} | ${i.customer.name} | ${i.vehicle?.plate ?? "n/a"} | ${i.vehicle?.model ?? "n/a"} | ${i.vehicle?.brand ?? "n/a"}`
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
