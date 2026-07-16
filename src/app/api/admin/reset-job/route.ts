import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/auth";
import { prisma } from "@/lib/db";

export const dynamic = "force-dynamic";

export async function POST(request: NextRequest) {
  try {
    await requireAdmin();

    const body = await request.json().catch(() => ({}));
    const inspectionId = typeof body.inspectionId === "string" ? body.inspectionId : null;
    const allErrors = body.allErrors === true;

    if (!inspectionId && !allErrors) {
      return NextResponse.json({ ok: false, message: "Informe inspectionId ou allErrors" }, { status: 400 });
    }

    if (allErrors) {
      const errored = await prisma.inspection.findMany({
        where: { status: "ERRO" },
        select: { id: true, customerId: true },
      });

      const ids = errored.map((e) => e.id);

      if (ids.length > 0) {
        await prisma.inspection.updateMany({
          where: { id: { in: ids } },
          data: { status: "AGUARDANDO", nfseNumber: null, errorMessage: null },
        });
        await prisma.invoiceJob.updateMany({
          where: { inspectionId: { in: ids } },
          data: { status: "FILA", lastError: null, attempts: 0 },
        });
      }

      return NextResponse.json({ ok: true, resetCount: ids.length });
    }

    const inspection = await prisma.inspection.findUnique({
      where: { id: inspectionId! },
      include: { job: true },
    });

    if (!inspection) {
      return NextResponse.json({ ok: false, message: "Vistoria não encontrada" }, { status: 404 });
    }

    if (inspection.status !== "ERRO") {
      return NextResponse.json({ ok: false, message: "Só é possível resetar status ERRO" }, { status: 400 });
    }

    await prisma.inspection.update({
      where: { id: inspection.id },
      data: { status: "AGUARDANDO", nfseNumber: null, errorMessage: null },
    });

    if (inspection.job) {
      await prisma.invoiceJob.update({
        where: { id: inspection.job.id },
        data: { status: "FILA", lastError: null, attempts: 0 },
      });
    } else {
      await prisma.invoiceJob.create({
        data: {
          inspectionId: inspection.id,
          status: "FILA",
          attempts: 0,
        },
      });
    }

    return NextResponse.json({ ok: true });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Erro interno";
    return NextResponse.json({ ok: false, message }, { status: 500 });
  }
}
