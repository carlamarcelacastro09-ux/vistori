import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";

function formatBR(date: Date) {
  const dd = String(date.getDate()).padStart(2, "0");
  const mm = String(date.getMonth() + 1).padStart(2, "0");
  const yyyy = String(date.getFullYear());
  return `${dd}/${mm}/${yyyy}`;
}

function isComplete(insp: {
  customerDoc: string | null;
  customerCep: string | null;
  customerStreet: string | null;
  customerNumber: string | null;
  customerDistrict: string | null;
  customerCity: string | null;
  customerName: string | null;
  vehiclePlate: string | null;
  vehicleBrand: string | null;
  vehicleModel: string | null;
}) {
  const cep = String(insp.customerCep || "").replace(/\D/g, "");
  if (cep.length !== 8) return false;
  if (!String(insp.customerStreet || "").trim()) return false;
  if (!String(insp.customerNumber || "").trim()) return false;
  if (!String(insp.customerDistrict || "").trim()) return false;
  if (!String(insp.customerCity || "").trim()) return false;
  if (!String(insp.customerDoc || "").trim()) return false;
  if (!String(insp.customerName || "").trim()) return false;
  if (!String(insp.vehiclePlate || "").trim()) return false;
  if (!String(insp.vehicleBrand || "").trim()) return false;
  if (!String(insp.vehicleModel || "").trim()) return false;
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

    const claim = await prisma.invoiceJob.updateMany({
      where: { id: job.id, status: job.status, updatedAt: job.updatedAt },
      data: { status: "PROCESSANDO", attempts: { increment: 1 } },
    });
    if (claim.count === 0) continue;

    const lastNfse = await prisma.inspection.findFirst({
      where: {
        customer: { doc: insp.customerDoc ?? "" },
        nfseNumber: { not: null },
        id: { not: insp.id },
      },
      orderBy: { date: "desc" },
      select: { nfseNumber: true },
    });

    return NextResponse.json({
      ok: true,
      job: {
        jobId: job.id,
        competenceDate: formatBR(insp.date),
        paidValue: Number(insp.paidValue),
        noteValue: Number(insp.noteValue),
        plate: insp.vehiclePlate ?? "",
        vehicleBrand: insp.vehicleBrand ?? "",
        vehicleModel: insp.vehicleModel ?? "",
        customerDoc: insp.customerDoc ?? "",
        customerName: insp.customerName ?? "",
        cep: insp.customerCep ?? "",
        street: insp.customerStreet ?? "",
        number: insp.customerNumber ?? "",
        district: insp.customerDistrict ?? "",
        city: insp.customerCity ?? "",
        lastNfseNumber: lastNfse?.nfseNumber ?? null,
        dpsNumber: insp.nDps,
      },
    });
  }

  return NextResponse.json({ ok: true, job: null });
}
