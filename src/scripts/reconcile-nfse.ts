import "dotenv/config";
import fs from "node:fs";
import { parse } from "csv-parse/sync";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "../generated/prisma/client";

/**
 * Reconcilia as notas emitidas (do PDF/screenshots) com o banco de dados.
 *
 * Para cada nota no CSV (numero, data, cpf_cnpj, nome):
 * 1. Busca inspeções do mesmo cliente (por CPF/CNPJ) com status != LANCADO
 *    que ainda não têm nfseNumber
 * 2. Atualiza o status para LANCADO e grava o número da nota
 * 3. Marca o InvoiceJob como CONCLUIDO
 *
 * Notas que já estão no banco com o número correto são ignoradas.
 */

function onlyDigits(v: string) {
  return String(v || "").replace(/\D/g, "");
}

function parseDate(v: string) {
  const m = v.match(/^(\d{2})\/(\d{2})\/(\d{4})/);
  if (m) return new Date(Number(m[3]), Number(m[2]) - 1, Number(m[1]));
  return new Date(v);
}

async function main() {
  const databaseUrl = process.env.DATABASE_URL;
  if (!databaseUrl) throw new Error("DATABASE_URL não configurada");

  const adapter = new PrismaPg({ connectionString: databaseUrl });
  const prisma = new PrismaClient({ adapter });

  try {
    const csvContent = fs.readFileSync("notas-emitidas.csv", "utf-8");
    const rows = parse(csvContent, {
      columns: true,
      skip_empty_lines: true,
      trim: true,
    }) as { numero: string; data: string; cpf_cnpj: string; nome: string }[];

    console.log(`CSV carregado: ${rows.length} notas\n`);

    // Primeiro, ver quais notas já estão no banco
    const existingNotes = await prisma.inspection.findMany({
      where: { nfseNumber: { not: null } },
      select: { nfseNumber: true },
    });
    const existingSet = new Set(existingNotes.map((n) => n.nfseNumber!));

    let matched = 0;
    let alreadyOk = 0;
    let notFound = 0;
    let multipleFound = 0;
    const notFoundList: string[] = [];

    for (const row of rows) {
      const nfseNumber = row.numero.trim();
      const doc = onlyDigits(row.cpf_cnpj);
      const emissao = parseDate(row.data);

      // Já está no banco com esse número?
      if (existingSet.has(nfseNumber)) {
        alreadyOk++;
        continue;
      }

      // Buscar inspeções desse cliente sem nota emitida
      // Usa janela de +/- 15 dias da data de emissão para encontrar a inspeção certa
      const windowStart = new Date(emissao);
      windowStart.setDate(windowStart.getDate() - 15);
      const windowEnd = new Date(emissao);
      windowEnd.setDate(windowEnd.getDate() + 15);

      const candidates = await prisma.inspection.findMany({
        where: {
          customer: { doc },
          nfseNumber: null,
          status: { in: ["AGUARDANDO", "ERRO", "EMITIDA"] },
          date: { gte: windowStart, lte: windowEnd },
        },
        orderBy: { date: "asc" },
        include: { customer: true, job: true },
      });

      if (candidates.length === 0) {
        // Tenta busca mais ampla (sem janela de data)
        const broadCandidates = await prisma.inspection.findMany({
          where: {
            customer: { doc },
            nfseNumber: null,
            status: { in: ["AGUARDANDO", "ERRO", "EMITIDA"] },
          },
          orderBy: { date: "asc" },
          include: { customer: true, job: true },
        });

        if (broadCandidates.length === 0) {
          notFound++;
          notFoundList.push(`Nota ${nfseNumber} | ${row.data} | ${doc} | ${row.nome}`);
          continue;
        }

        // Usa o candidato mais antigo (FIFO)
        const pick = broadCandidates[0];
        await reconcile(prisma, pick.id, pick.job?.id, nfseNumber);
        matched++;
        console.log(`  [BROAD] Nota ${nfseNumber} -> Inspeção ${pick.id} | ${pick.customer.name} | ${pick.date.toISOString().slice(0, 10)}`);
        continue;
      }

      // Pega o primeiro candidato (FIFO — mais antigo primeiro)
      const pick = candidates[0];
      await reconcile(prisma, pick.id, pick.job?.id, nfseNumber);
      matched++;

      if (candidates.length > 1) {
        multipleFound++;
      }

      console.log(`  Nota ${nfseNumber} -> Inspeção ${pick.id} | ${pick.customer.name} | ${pick.date.toISOString().slice(0, 10)}`);
    }

    console.log(`\n=== RESUMO ===`);
    console.log(`Total notas no CSV: ${rows.length}`);
    console.log(`Já estavam OK no banco: ${alreadyOk}`);
    console.log(`Reconciliadas agora: ${matched}`);
    console.log(`Múltiplos candidatos (usou FIFO): ${multipleFound}`);
    console.log(`Não encontradas no banco: ${notFound}`);

    if (notFoundList.length > 0) {
      console.log(`\n--- Notas não encontradas ---`);
      for (const line of notFoundList) console.log(`  ${line}`);
    }
  } finally {
    await prisma.$disconnect();
  }
}

async function reconcile(
  prisma: PrismaClient,
  inspectionId: string,
  jobId: string | undefined,
  nfseNumber: string,
) {
  const txOps = [
    prisma.inspection.update({
      where: { id: inspectionId },
      data: {
        status: "LANCADO",
        nfseNumber,
        errorMessage: null,
      },
    }),
  ];

  if (jobId) {
    txOps.push(
      prisma.invoiceJob.update({
        where: { id: jobId },
        data: {
          status: "CONCLUIDO",
          lastError: null,
        },
      }) as any,
    );
  }

  await prisma.$transaction(txOps);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
