import { prisma } from "@/lib/db";

function parseDate(v: string) {
  const raw = String(v || "").trim();
  const m = raw.match(/^(\d{2})\/(\d{2})\/(\d{4})/);
  if (m) {
    const [, dd, mm, yyyy] = m;
    return new Date(Number(yyyy), Number(mm) - 1, Number(dd));
  }
  return null;
}

async function main() {
  const targetDate = parseDate("20/06/2026");
  if (!targetDate) throw new Error("Data inválida");

  const start = new Date(targetDate.getFullYear(), targetDate.getMonth(), targetDate.getDate());
  const end = new Date(targetDate.getFullYear(), targetDate.getMonth(), targetDate.getDate() + 1);

  const toDelete = await prisma.inspection.findMany({
    where: {
      NOT: {
        OR: [
          { status: "EMITIDA" },
          { status: "LANCADO" },
          { date: { gte: start, lt: end } },
        ],
      },
    },
    include: { vehicle: true },
  });

  console.log(`Encontradas ${toDelete.length} inspeções pendentes com data diferente de 20/06/2026 para remover.`);
  for (const insp of toDelete) {
    console.log(`- ${insp.vehicle?.plate || "sem placa"} | ${insp.status} | ${insp.date.toISOString()}`);
  }

  if (toDelete.length === 0) return;

  const ids = toDelete.map((i) => i.id);
  await prisma.invoiceJob.deleteMany({ where: { inspectionId: { in: ids } } });
  await prisma.inspection.deleteMany({ where: { id: { in: ids } } });

  console.log(`Removidas ${toDelete.length} inspeções.`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
