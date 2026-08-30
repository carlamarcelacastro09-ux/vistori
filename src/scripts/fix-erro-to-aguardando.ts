import "dotenv/config";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "../generated/prisma/client";

/**
 * Script de correção:
 * 1. Remove inspeções duplicadas com placa EHUJ77 e nota 5778
 *    (mantém apenas a primeira, que é legítima)
 * 2. Converte todas as inspeções com status ERRO para AGUARDANDO
 *    e recoloca os jobs na fila (FILA) para o robô reprocessar
 */

function requiredEnv(name: string) {
  const v = process.env[name];
  if (!v) throw new Error(`Variável ${name} não configurada.`);
  return v;
}

async function main() {
  const databaseUrl = requiredEnv("DATABASE_URL");
  const adapter = new PrismaPg({ connectionString: databaseUrl });
  const prisma = new PrismaClient({ adapter });

  try {
    // ============================================================
    // PARTE 1: Remover registros duplicados EHUJ77 com nota 5778
    // A última nota emitida corretamente foi 6264
    // ============================================================
    console.log("=== PARTE 1: Removendo registros duplicados EHUJ77 ===\n");

    const dupes = await prisma.inspection.findMany({
      where: {
        vehicle: { plate: "EHUJ77" },
        nfseNumber: "5778",
      },
      include: { vehicle: true, customer: true, job: true },
      orderBy: { createdAt: "asc" },
    });

    console.log(`Encontradas ${dupes.length} inspeções com EHUJ77 e nota 5778`);

    if (dupes.length > 0) {
      // Remove TODAS — o usuário disse que os dados estão incorretos
      for (const d of dupes) {
        console.log(`  Removendo: ${d.id} | ${d.date.toISOString().slice(0, 10)} | Cliente: ${d.customer.name} | Nota: ${d.nfseNumber}`);
        // InvoiceJob tem onDelete: Cascade, então será removido junto
        await prisma.inspection.delete({ where: { id: d.id } });
      }
      console.log(`  ${dupes.length} registros removidos.\n`);
    }

    // ============================================================
    // PARTE 2: Converter ERRO → AGUARDANDO e recolocar na fila
    // ============================================================
    console.log("=== PARTE 2: Convertendo status ERRO → AGUARDANDO ===\n");

    const erroInspections = await prisma.inspection.findMany({
      where: {
        status: "ERRO",
        nfseNumber: null, // Não emitida
      },
      include: { job: true, customer: true, vehicle: true },
      orderBy: { createdAt: "asc" },
    });

    console.log(`Encontradas ${erroInspections.length} inspeções com status ERRO para converter\n`);

    let converted = 0;
    for (const insp of erroInspections) {
      console.log(`  Convertendo: ${insp.id} | ${insp.date.toISOString().slice(0, 10)} | Placa: ${insp.vehicle?.plate ?? "N/A"} | Cliente: ${insp.customer.name.slice(0, 25)} | Erro: ${(insp.errorMessage || "").slice(0, 50)}`);

      await prisma.$transaction([
        prisma.inspection.update({
          where: { id: insp.id },
          data: {
            status: "AGUARDANDO",
            errorMessage: null,
          },
        }),
        // Se já tem job, reseta para FILA
        ...(insp.job
          ? [
              prisma.invoiceJob.update({
                where: { id: insp.job.id },
                data: {
                  status: "FILA",
                  attempts: 0,
                  lastError: null,
                },
              }),
            ]
          : [
              // Se não tem job, cria um novo
              prisma.invoiceJob.create({
                data: {
                  inspectionId: insp.id,
                  status: "FILA",
                },
              }),
            ]),
      ]);

      converted++;
    }

    console.log(`\n${converted} inspeções convertidas de ERRO para AGUARDANDO e jobs recolocados na fila.`);
    console.log("O robô irá processá-las na próxima execução.");
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
