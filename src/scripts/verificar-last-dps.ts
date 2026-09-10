import "dotenv/config";
import { prisma } from "../lib/db";

async function main() {
  const comNfse = await prisma.inspection.findMany({
    where: { nDps: { not: null } },
    select: { nDps: true },
  });

  let maxDps = 0;
  for (const r of comNfse) {
    const n = parseInt(r.nDps || "0", 10);
    if (!isNaN(n) && n > maxDps) maxDps = n;
  }

  const erroredJobs = await prisma.invoiceJob.findMany({
    where: { status: "ERRO" },
    select: { id: true, attempts: true, lastError: true },
  });

  console.log("\nJobs em ERRO:");
  for (const j of erroredJobs) {
    console.log(`  ${j.id} | attempts ${j.attempts} | ${(j.lastError || "").slice(0, 80)}`);
  }

  const dpsConsumidosPorErro = erroredJobs.filter(
    (j) => !(j.lastError || "").includes("E0014")
  ).length;

  const lastDps = maxDps + dpsConsumidosPorErro;

  console.log(`\nMaior nDps no banco: ${maxDps}`);
  console.log(`Jobs em ERRO não-E0014: ${dpsConsumidosPorErro}`);
  console.log(`Próximo nDPS: ${lastDps + 1}`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
