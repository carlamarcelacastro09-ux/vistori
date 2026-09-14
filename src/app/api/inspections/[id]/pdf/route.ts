import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { requireUser } from "@/lib/auth";
import { PDFDocument, StandardFonts, rgb } from "pdf-lib";

export const dynamic = "force-dynamic";

export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const user = await requireUser();
  if (!user) return NextResponse.json({ ok: false, message: "Não autorizado" }, { status: 401 });

  const { id } = await params;
  const inspection = await prisma.inspection.findUnique({
    where: { id },
    include: { customer: true, vehicle: true },
  });

  if (!inspection) {
    return NextResponse.json({ ok: false, message: "Vistoria não encontrada" }, { status: 404 });
  }

  if (!inspection.nfseNumber) {
    return NextResponse.json({ ok: false, message: "Nota ainda não emitida" }, { status: 400 });
  }

  const pdfDoc = await PDFDocument.create();
  const page = pdfDoc.addPage([595, 842]); // A4
  const font = await pdfDoc.embedFont(StandardFonts.Helvetica);
  const fontBold = await pdfDoc.embedFont(StandardFonts.HelveticaBold);

  const { width, height } = page.getSize();
  let y = height - 48;

  function text(str: string, x: number, size = 10, bold = false, color = rgb(0.1, 0.1, 0.1)) {
    page.drawText(str, { x, y, size, font: bold ? fontBold : font, color });
  }

  function line(label: string, value: string, x = 48, w = width - 96, size = 10) {
    text(label, x, size, true);
    y -= 14;
    text(value, x, size);
    y -= 18;
  }

  // Cabeçalho
  page.drawRectangle({ x: 0, y: height - 80, width, height: 80, color: rgb(0.15, 0.23, 0.42) });
  page.drawText("COMPROVANTE DE NFS-e", { x: 48, y: height - 50, size: 20, font: fontBold, color: rgb(1, 1, 1) });
  page.drawText("Pissarro Vistoria Automotiva Ltda", { x: 48, y: height - 72, size: 11, font, color: rgb(0.85, 0.85, 0.85) });

  y = height - 110;

  line("Número da NFS-e / DPS", String(inspection.nfseNumber ?? "-"));
  line("Data da vistoria", new Date(inspection.date).toLocaleDateString("pt-BR"));
  line("Chave de acesso", "Disponível no portal NFS-e");

  // Tomador
  text("TOMADOR DO SERVIÇO", 48, 12, true, rgb(0.15, 0.23, 0.42));
  y -= 20;
  line("Nome", inspection.customer?.name ?? "-");
  line("CPF/CNPJ", inspection.customer?.doc ?? "-");
  line("Endereço", `${inspection.customer?.street ?? ""}, ${inspection.customer?.number ?? ""} - ${inspection.customer?.district ?? ""}`);

  // Veículo
  text("VEÍCULO", 48, 12, true, rgb(0.15, 0.23, 0.42));
  y -= 20;
  line("Placa", inspection.vehicle?.plate ?? "-");
  line("Marca / Modelo", `${inspection.vehicle?.brand ?? ""} ${inspection.vehicle?.model ?? ""}`.trim() || "-");

  // Serviço
  text("SERVIÇO PRESTADO", 48, 12, true, rgb(0.15, 0.23, 0.42));
  y -= 20;
  line("Descrição", `VISTORIA AUTOMOTIVA - ${inspection.vehicle?.model ?? ""} - ${inspection.vehicle?.plate ?? ""}`);
  line("Valor", Number(inspection.noteValue ?? 0).toLocaleString("pt-BR", { style: "currency", currency: "BRL" }));

  // Rodapé
  page.drawText("Este documento é um resumo informativo. O PDF oficial com validade jurídica deve ser obtido no portal da NFS-e.", {
    x: 48,
    y: 48,
    size: 8,
    font,
    color: rgb(0.4, 0.4, 0.4),
  });

  const bytes = await pdfDoc.save();
  const buffer = Buffer.from(bytes);

  return new NextResponse(buffer, {
    headers: {
      "content-type": "application/pdf",
      "content-disposition": `attachment; filename="nfs-e-${inspection.nfseNumber}.pdf"`,
    },
  });
}
