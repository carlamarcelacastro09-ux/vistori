import "dotenv/config";
import { prisma } from "../lib/db";

async function main() {
  const jobs = await prisma.invoiceJob.findMany({
    where: {
      status: "ERRO",
      lastError: { contains: "next-dps: 404" },
    },
    include: { inspection: true },
  });

  console.log(`Jobs com erro next-dps 404: ${jobs.length}`);
  for (const j of jobs) {
    console.log(`  ${j.id} | inspeção ${j.inspectionId} | ${j.lastError?.slice(0, 80)}`);
  }

  if (jobs.length > 0) {
    await prisma.$transaction(
      jobs.map((j) =>
        prisma.invoiceJob.update({
          where: { id: j.id },
          data: { status: "FILA", attempts: 0, lastError: null },
        })
      )
    );
    console.log(`\n${jobs.length} job(s) resetado(s) para FILA.`);
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
