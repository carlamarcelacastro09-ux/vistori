import "dotenv/config";
import { prisma } from "../lib/db";
import { writeFileSync } from "fs";

async function main() {
  const inspections = await prisma.inspection.findMany({
    where: { nfseNumber: { not: null } },
    include: { customer: true, vehicle: true },
    orderBy: { date: "desc" },
  });

  const out = inspections.map((i) => ({
    id: i.id,
    nfseNumber: i.nfseNumber,
    nDps: i.nDps,
    data: i.date.toISOString().split("T")[0],
    cpf: i.customer?.doc || "",
    placa: i.vehicle?.plate || "",
    modelo: i.vehicle?.model || "",
    status: i.status,
  }));

  writeFileSync("inspecoes-banco.json", JSON.stringify(out, null, 2), "utf-8");
  console.log(`${out.length} inspeções exportadas`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
