import "dotenv/config";
import pg from "pg";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "./src/generated/prisma/client";

const { Pool } = pg;
const prisma = new PrismaClient({
  adapter: new PrismaPg(new Pool({ connectionString: process.env.DATABASE_URL })),
});

async function main() {
  const cs = await prisma.customer.findMany({
    where: { name: { contains: "JOSE ROBERTO" } },
  });
  for (const c of cs) {
    const cnt = await prisma.inspection.count({
      where: { customerId: c.id, status: "AGUARDANDO", nfseNumber: null },
    });
    console.log(`${c.id} | ${c.doc} | ${c.name} | ${cnt}`);
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
