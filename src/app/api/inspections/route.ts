import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getSession } from "@/lib/session";
import { createInspectionSchema } from "@/lib/validation";
import { enqueueInvoiceJob } from "@/lib/sqs";
import { cityKey } from "@/lib/normalize";

export async function GET() {
  const session = await getSession();
  if (!session.user) return NextResponse.json({ ok: false }, { status: 401 });

  const inspections = await prisma.inspection.findMany({
    take: 200,
    orderBy: { createdAt: "desc" },
    include: {
      customer: true,
      vehicle: true,
      job: true,
    },
  });

  return NextResponse.json({ ok: true, inspections });
}

export async function POST(req: Request) {
  const session = await getSession();
  if (!session.user) return NextResponse.json({ ok: false }, { status: 401 });

  const body = await req.json().catch(() => null);
  const parsed = createInspectionSchema.safeParse(body);
  if (!parsed.success) {
    const fields: Record<string, string> = {};
    for (const issue of parsed.error.issues) {
      const key = issue.path[0];
      if (typeof key === "string" && !fields[key]) fields[key] = issue.message;
    }
    return NextResponse.json(
      { ok: false, message: "Corrija os campos destacados.", fields },
      { status: 400 },
    );
  }

  const data = parsed.data;

  const city = cityKey(data.city);

  const customer = await prisma.customer.upsert({
    where: { doc: data.customerDoc },
    create: {
      doc: data.customerDoc,
      name: data.customerName,
      street: data.street,
      number: data.number,
      district: data.district,
      city,
      cep: data.cep,
    },
    update: {
      name: data.customerName,
      street: data.street,
      number: data.number,
      district: data.district,
      city,
      cep: data.cep,
    },
  });

  await prisma.street.upsert({
    where: {
      street_district_city_cep: {
        street: data.street,
        district: data.district,
        city,
        cep: data.cep,
      },
    },
    create: {
      street: data.street,
      district: data.district,
      city,
      cep: data.cep,
    },
    update: {},
  });

  const vehicle = await prisma.vehicle.upsert({
    where: { plate: data.plate },
    create: { plate: data.plate, brand: data.vehicleBrand, model: data.vehicleModel },
    update: { brand: data.vehicleBrand, model: data.vehicleModel },
  });

  await prisma.vehicleCatalog.upsert({
    where: { model: data.vehicleModel },
    create: { model: data.vehicleModel, brand: data.vehicleBrand },
    update: { brand: data.vehicleBrand },
  });

  const paidValueStr = data.paidValue.toFixed(2);

  const inspection = await prisma.inspection.create({
    data: {
      date: new Date(),
      paidValue: paidValueStr,
      noteValue: "25.00",
      customerId: customer.id,
      vehicleId: vehicle.id,
      createdById: session.user.id,
      status: "AGUARDANDO",
      job: {
        create: {
          status: "FILA",
        },
      },
    },
    include: { job: true },
  });

  if (inspection.job) {
    await enqueueInvoiceJob({ jobId: inspection.job.id });
  }

  return NextResponse.json({ ok: true, inspectionId: inspection.id });
}
