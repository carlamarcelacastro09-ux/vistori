import { prisma } from "@/lib/db";

async function main() {
  const groups = await prisma.invoiceJob.groupBy({
    by: ["status"],
    _count: true,
  });
  console.log(groups);

  const erros = await prisma.inspection.findMany({
    where: { status: "ERRO" },
    include: { vehicle: true, job: true },
  });
  console.log("\nErros:", erros.map((e) => `${e.vehicle?.plate} | ${e.job?.status} | ${e.errorMessage?.slice(0, 50)}`));
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
