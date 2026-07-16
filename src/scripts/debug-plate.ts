import { prisma } from "@/lib/db";

async function main() {
  const plate = process.argv[2] || "MQU4413";
  const inspections = await prisma.inspection.findMany({
    where: { vehicle: { plate } },
    include: { vehicle: true, customer: true, job: true },
  });
  console.log(JSON.stringify(inspections, null, 2));
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
