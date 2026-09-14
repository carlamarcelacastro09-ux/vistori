import "dotenv/config";
import { prisma } from "../lib/db";

async function main() {
  const jobs = await prisma.invoiceJob.findMany({
    where: {
      status: "FILA",
      lastError: { contains: "next-dps: 404" },
    },
    include: { inspection: true },
  });

  console.log(`Jobs 404 em FILA: ${jobs.length}`);
  for (const j of jobs) {
    console.log(`  inspeção ${j.inspectionId} | status ${j.inspection.status} | ${j.lastError?.slice(0, 60)}`);
  }

  await prisma.$transaction(
    jobs.map((j) =>
      prisma.inspection.update({
        where: { id: j.inspectionId },
        data: { status: "AGUARDANDO", errorMessage: null },
      })
    )
  );

  console.log(`${jobs.length} inspeções limpas e prontas para o robô.`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
