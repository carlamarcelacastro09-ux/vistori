import "dotenv/config";
import pg from "pg";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "./src/generated/prisma/client";
import fs from "node:fs";
import path from "node:path";

const { Pool } = pg;

const prisma = new PrismaClient({
  adapter: new PrismaPg(new Pool({ connectionString: process.env.DATABASE_URL })),
});

async function main() {
  const customer = await prisma.customer.findFirst({
    where: { name: { contains: "JOSE ROBERTO" } },
  });

  if (!customer) {
    console.log("Cliente não encontrado.");
    return;
  }

  const inspections = await prisma.inspection.findMany({
    where: { customerId: customer.id, status: "AGUARDANDO" },
    include: { vehicle: true },
    orderBy: { date: "asc" },
  });

  const customerVehicles = await prisma.vehicle.findMany({
    where: { inspections: { some: { customerId: customer.id } } },
  });

  console.log(`Cliente: ${customer.doc} | ${customer.name}`);
  console.log("\n--- Veículos cadastrados para esse cliente ---");
  for (const v of customerVehicles) {
    console.log(`${v.plate} | ${v.model} | ${v.brand}`);
  }

  console.log("\n--- Inspeções aguardando (21 notas 5778) ---");
  for (const i of inspections) {
    console.log(
      `${i.id} | ${i.date.toISOString().slice(0, 10)} | ${i.vehicle?.plate ?? "n/a"} | ${i.vehicle?.model ?? "n/a"} | ${i.vehicle?.brand ?? "n/a"}`
    );
  }

  const outPath = path.join(process.cwd(), "correcao_veiculos_5778.csv");
  const header = "inspection_id,data,placa_atual,modelo_atual,marca_atual,placa_correta,modelo_correto,marca_correta\n";
  const rows = inspections.map((i) => {
    const v = i.vehicle;
    return `${i.id},${i.date.toISOString().slice(0, 10)},${v?.plate ?? ""},${v?.model ?? ""},${v?.brand ?? ""},,,`;
  });
  fs.writeFileSync(outPath, header + rows.join("\n"), "utf8");
  console.log(`\nCSV gerado: ${outPath}`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
