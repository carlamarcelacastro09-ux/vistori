import { prisma } from "@/lib/db";

async function main() {
  const erros = await prisma.inspection.findMany({
    where: { status: "ERRO" },
    include: { vehicle: true, job: true },
  });

  console.log(`Encontradas ${erros.length} inspeções com ERRO para resetar.`);
  if (erros.length === 0) return;

  await prisma.$transaction(
    erros.map((insp) =>
      prisma.inspection.update({
        where: { id: insp.id },
        data: {
          status: "AGUARDANDO",
          errorMessage: null,
          nfseNumber: null,
          job: {
            update: {
              status: "FILA",
              attempts: 0,
              lastError: null,
            },
          },
        },
      }),
    ),
  );

  console.log(`${erros.length} inspeções resetadas para AGUARDANDO e jobs para FILA.`);
  for (const insp of erros) {
    const plate = insp.vehicle?.plate || "sem placa";
    console.log(`- ${plate} | ${insp.job?.id || "sem job"}`);
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
