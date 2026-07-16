import { prisma } from "@/lib/db";

async function main() {
  const inspections = await prisma.inspection.findMany({
    include: { customer: true, vehicle: true, job: true },
  });

  const noCustomer = inspections.filter((i) => !i.customer);
  const noVehicle = inspections.filter((i) => !i.vehicle);
  const noJob = inspections.filter((i) => !i.job);

  console.log(`Total inspeções: ${inspections.length}`);
  console.log(`Sem cliente: ${noCustomer.length}`);
  console.log(`Sem veículo: ${noVehicle.length}`);
  console.log(`Sem job: ${noJob.length}`);

  for (const i of noCustomer) {
    console.log(`Sem cliente: ${i.id} | ${i.vehicle?.plate || "sem placa"} | status ${i.status}`);
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
