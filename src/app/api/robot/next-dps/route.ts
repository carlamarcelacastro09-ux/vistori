import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db";

export const dynamic = "force-dynamic";

const schema = z.object({
  cnpj: z.string().min(11).max(14),
  serie: z.string().min(1).max(5),
  jobId: z.string().uuid().optional(),
});

export async function POST(req: Request) {
  const apiKey = req.headers.get("x-api-key");
  if (!apiKey || apiKey !== process.env.ROBOT_API_KEY) {
    return NextResponse.json({ ok: false }, { status: 401 });
  }

  const body = await req.json().catch(() => null);
  const parsed = schema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ ok: false, message: "Dados inválidos." }, { status: 400 });
  }

  const cnpj = parsed.data.cnpj.replace(/\D/g, "");
  const { serie, jobId } = parsed.data;

  // Incremento atômico: uma única query, sem race condition entre execuções do robô.
  const rows = await prisma.$queryRaw<Array<{ lastNumber: number }>>`
    INSERT INTO "DpsCounter" ("cnpj", "serie", "lastNumber", "updatedAt")
    VALUES (${cnpj}, ${serie}, 1, now())
    ON CONFLICT ("cnpj", "serie")
    DO UPDATE SET "lastNumber" = "DpsCounter"."lastNumber" + 1, "updatedAt" = now()
    RETURNING "lastNumber"
  `;

  const numero = rows[0]?.lastNumber;
  if (!numero || numero < 1) {
    return NextResponse.json({ ok: false, message: "Falha ao gerar nDPS." }, { status: 500 });
  }

  // Grava o nDPS reservado antes do envio ao SEFIN: se o robô morrer no meio,
  // a próxima execução reconcilia esse número em vez de emitir uma segunda nota.
  if (jobId) {
    const job = await prisma.invoiceJob.findUnique({ where: { id: jobId }, select: { inspectionId: true } });
    if (job) {
      await prisma.inspection.update({
        where: { id: job.inspectionId },
        data: { dpsNumber: String(numero) },
      });
    }
  }

  return NextResponse.json({ ok: true, nDPS: String(numero) });
}
