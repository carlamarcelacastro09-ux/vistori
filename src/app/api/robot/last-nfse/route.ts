import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";

export const dynamic = "force-dynamic";

function isE0014(msg: string | null) {
  return (msg || "").includes("E0014");
}

export async function POST(req: Request) {
  const apiKey = req.headers.get("x-api-key");
  if (!apiKey || apiKey !== process.env.ROBOT_API_KEY) {
    return NextResponse.json({ ok: false }, { status: 401 });
  }

  // Busca o maior nDPS numérico no banco (o DPS real consumido na SEFIN).
  // Notas concluídas guardam nDps preenchido. Jobs em ERRO podem ter
  // consumido 1 nDPS se a requisição chegou na SEFIN e foi rejeitada
  // por outro motivo. E0014 não consome nDPS (duplicidade).
  const [comDps, erroredJobs] = await Promise.all([
    prisma.inspection.findMany({
      where: { nDps: { not: null } },
      select: { nDps: true },
    }),
    prisma.invoiceJob.findMany({
      where: { status: "ERRO" },
      select: { lastError: true },
    }),
  ]);

  let maxDps = 0;
  for (const r of comDps) {
    const n = parseInt(r.nDps || "0", 10);
    if (!isNaN(n) && n > maxDps) maxDps = n;
  }

  // Se já temos nDps no banco, o maior deles já é o último DPS consumido.
  // Erros anteriores sem nDps gravado não devem avançar o contador,
  // pois estamos usando o nDps real da SEFIN.
  if (maxDps > 0) {
    return NextResponse.json({ ok: true, lastNumber: String(maxDps) });
  }

  // Fallback: sem nDps no banco, contar erros que consumiram DPS.
  const dpsConsumidosPorErro = erroredJobs.filter(
    (j) => !isE0014(j.lastError)
  ).length;

  const comNfse = await prisma.inspection.findMany({
    where: { nfseNumber: { not: null } },
    select: { nfseNumber: true },
  });

  let maxNfse = 0;
  for (const r of comNfse) {
    const n = parseInt(r.nfseNumber || "0", 10);
    if (!isNaN(n) && n > maxNfse) maxNfse = n;
  }

  const lastDps = maxNfse + dpsConsumidosPorErro;

  return NextResponse.json({ ok: true, lastNumber: String(lastDps) });
}
