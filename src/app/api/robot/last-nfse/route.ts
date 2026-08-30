import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";

export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  const apiKey = req.headers.get("x-api-key");
  if (!apiKey || apiKey !== process.env.ROBOT_API_KEY) {
    return NextResponse.json({ ok: false }, { status: 401 });
  }

  // Busca o maior nfseNumber numérico no banco (notas emitidas pela API Nacional usam números sequenciais)
  const rows = await prisma.inspection.findMany({
    where: { nfseNumber: { not: null } },
    select: { nfseNumber: true },
  });

  let max = 0;
  for (const r of rows) {
    const n = parseInt(r.nfseNumber || "0", 10);
    if (!isNaN(n) && n > max) max = n;
  }

  return NextResponse.json({ ok: true, lastNumber: String(max) });
}
