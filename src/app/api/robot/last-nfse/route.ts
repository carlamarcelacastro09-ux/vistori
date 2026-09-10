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

  // Busca o maior nfseNumber numérico no banco (nNFSe das notas concluídas)
  const rows = await prisma.inspection.findMany({
    where: { nfseNumber: { not: null } },
    select: { nfseNumber: true },
  });

  let maxNfse = 0;
  for (const r of rows) {
    const n = parseInt(r.nfseNumber || "0", 10);
    if (!isNaN(n) && n > maxNfse) maxNfse = n;
  }

  // Cada job concluído consome 1 nDPS (o próprio nNFSe = nDPS quando ok).
  // Jobs em ERRO consomem 1 nDPS SOMENTE se a requisição chegou na SEFIN e
  // a nota foi rejeitada por outro motivo. E0014 é rejeição por duplicidade,
  // ou seja, o nDPS já existia e NÃO foi consumido nesta tentativa.
  const erroredJobs = await prisma.invoiceJob.findMany({
    where: { status: "ERRO" },
    select: { lastError: true },
  });

  const dpsConsumidosPorErro = erroredJobs.filter(
    (j) => !isE0014(j.lastError)
  ).length;

  const lastDps = maxNfse + dpsConsumidosPorErro;

  return NextResponse.json({ ok: true, lastNumber: String(lastDps) });
}
