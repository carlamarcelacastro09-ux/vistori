import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { z } from "zod";

const schema = z.object({
  jobId: z.string().uuid(),
  status: z.enum(["EMITIDA", "LANCADO", "ERRO"]),
  nfseNumber: z.string().optional(),
  errorMessage: z.string().optional(),
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

  const { jobId, status, nfseNumber, errorMessage } = parsed.data;

  const job = await prisma.invoiceJob.findUnique({
    where: { id: jobId },
    include: { inspection: true },
  });
  if (!job) return NextResponse.json({ ok: false, message: "Job não encontrado." }, { status: 404 });

  const sucesso = status === "EMITIDA" || status === "LANCADO";
  await prisma.$transaction([
    prisma.invoiceJob.update({
      where: { id: jobId },
      data: { status: sucesso ? "CONCLUIDO" : "ERRO", lastError: status === "ERRO" ? errorMessage : null },
    }),
    prisma.inspection.update({
      where: { id: job.inspectionId },
      data: { status: sucesso ? "LANCADO" : status, nfseNumber: sucesso ? nfseNumber ?? null : null, errorMessage: status === "ERRO" ? errorMessage ?? "Erro" : null },
    }),
  ]);

  return NextResponse.json({ ok: true });
}

