import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";

export const dynamic = "force-dynamic";

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

  // Cada job concluído consome 1 nDPS (o próprio nNFSe).
  // Tentativas que falharam (erro/pendente) também consomem 1 nDPS sem gerar nNFSe.
  // Portanto, o último nDPS usado = maior nNFSe + (total de tentativas - jobs concluídos).
  const [attemptsAgg, concluidos] = await Promise.all([
    prisma.invoiceJob.aggregate({ _sum: { attempts: true } }),
    prisma.invoiceJob.count({ where: { status: "CONCLUIDO" } }),
  ]);

  const totalAttempts = attemptsAgg._sum.attempts ?? 0;
  const erros = Math.max(0, totalAttempts - concluidos);
  const lastDps = maxNfse + erros;

  return NextResponse.json({ ok: true, lastNumber: String(lastDps) });
}
