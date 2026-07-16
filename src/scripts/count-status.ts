import { prisma } from "@/lib/db";

async function main() {
  const start = new Date(2026, 5, 20);

  const [statusGroups, emittedPlates, pendingPlates] = await Promise.all([
    prisma.inspection.groupBy({
      by: ["status"],
      where: { date: { gte: start } },
      _count: true,
    }),
    prisma.inspection.groupBy({
      by: ["vehicleId"],
      where: { date: { gte: start }, status: { in: ["EMITIDA", "LANCADO"] } },
      _count: true,
    }),
    prisma.inspection.groupBy({
      by: ["vehicleId"],
      where: { date: { gte: start }, status: "AGUARDANDO" },
      _count: true,
    }),
  ]);

  console.log("Por status:", statusGroups);
  console.log("Placas emitidas:", emittedPlates.length);
  console.log("Placas pendentes:", pendingPlates.length);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
