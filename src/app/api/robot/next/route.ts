import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";

function formatBR(date: Date) {
  const dd = String(date.getDate()).padStart(2, "0");
  const mm = String(date.getMonth() + 1).padStart(2, "0");
  const yyyy = String(date.getFullYear());
  return `${dd}/${mm}/${yyyy}`;
}

function isComplete(insp: {
  customer: { cep: string; street: string; number: string; district: string; city: string; doc: string; name: string };
  vehicle: { plate: string; brand: string; model: string } | null;
}) {
  const cep = String(insp.customer.cep || "").replace(/\D/g, "");
  if (cep.length !== 8) return false;
  if (!String(insp.customer.street || "").trim()) return false;
  if (!String(insp.customer.number || "").trim()) return false;
  if (!String(insp.customer.district || "").trim()) return false;
  if (!String(insp.customer.city || "").trim()) return false;
  if (!String(insp.customer.doc || "").trim()) return false;
  if (!String(insp.customer.name || "").trim()) return false;
  if (!insp.vehicle) return false;
  if (!String(insp.vehicle.plate || "").trim()) return false;
  if (!String(insp.vehicle.brand || "").trim()) return false;
  if (!String(insp.vehicle.model || "").trim()) return false;
  return true;
}

export async function GET() {
  return NextResponse.json({ ok: false, message: "Use POST." }, { status: 405 });
}

export async function POST(req: Request) {
  const apiKey = req.headers.get("x-api-key");
  if (!apiKey || apiKey !== process.env.ROBOT_API_KEY) {
    return NextResponse.json({ ok: false }, { status: 401 });
  }

  const cincoMinutosAtras = new Date(Date.now() - 5 * 60 * 1000);
  for (let i = 0; i < 15; i++) {
    const job = await prisma.invoiceJob.findFirst({
      where: {
        OR: [
          { status: "FILA" },
          { status: "PROCESSANDO", updatedAt: { lt: cincoMinutosAtras }, attempts: { lt: 3 } },
        ],
        inspection: {
          status: { notIn: ["EMITIDA", "LANCADO"] },
          nfseNumber: null,
        },
      },
      orderBy: { createdAt: "asc" },
      include: {
        inspection: {
          include: { customer: true, vehicle: true },
        },
      },
    });

    if (!job) return NextResponse.json({ ok: true, job: null });

    const insp = job.inspection;
    if (!isComplete(insp)) {
      await prisma.$transaction([
        prisma.invoiceJob.update({
          where: { id: job.id },
          data: { status: "ERRO", lastError: "Dados incompletos para emissão (CEP/rua/bairro/cidade/placa)." },
        }),
        prisma.inspection.update({
          where: { id: job.inspectionId },
          data: { status: "ERRO", errorMessage: "Dados incompletos para emissão. Complete endereço e veículo antes do robô." },
        }),
      ]);
      continue;
    }

    const updated = await prisma.invoiceJob.update({
      where: { id: job.id },
      data: { status: "PROCESSANDO", attempts: { increment: 1 } },
    });

    const lastNfse = await prisma.inspection.findFirst({
      where: {
        customer: { doc: insp.customer.doc },
        nfseNumber: { not: null },
        id: { not: insp.id },
      },
      orderBy: { date: "desc" },
      select: { nfseNumber: true },
    });

    return NextResponse.json({
      ok: true,
      job: {
        jobId: updated.id,
        competenceDate: formatBR(insp.date),
        paidValue: Number(insp.paidValue),
        noteValue: Number(insp.noteValue),
        plate: insp.vehicle?.plate ?? "",
        vehicleBrand: insp.vehicle?.brand ?? "",
        vehicleModel: insp.vehicle?.model ?? "",
        customerDoc: insp.customer.doc,
        customerName: insp.customer.name,
        cep: insp.customer.cep,
        street: insp.customer.street,
        number: insp.customer.number,
        district: insp.customer.district,
        city: insp.customer.city,
        lastNfseNumber: lastNfse?.nfseNumber ?? null,
      },
    });
  }

  return NextResponse.json({ ok: true, job: null });
}
