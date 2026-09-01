import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { getSession } from "@/lib/session";
import { createInspectionSchema } from "@/lib/validation";
import { enqueueInvoiceJob } from "@/lib/sqs";
import { cityKey } from "@/lib/normalize";
import { upsertVehicleByPlate } from "@/lib/vehicle";

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

  try {
    return await createInspection(parsed.data, session.user.id);
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    return NextResponse.json(
      { ok: false, message: `Erro ao salvar a vistoria: ${message}` },
      { status: 500 },
    );
  }
}

async function createInspection(data: z.infer<typeof createInspectionSchema>, userId: string) {
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

  const vehicle = await upsertVehicleByPlate({
    plate: data.plate,
    brand: data.vehicleBrand,
    model: data.vehicleModel,
  });

  await prisma.vehicleCatalog.upsert({
    where: { model: data.vehicleModel },
    create: { model: data.vehicleModel, brand: data.vehicleBrand },
    update: { brand: data.vehicleBrand },
  });

  const paidValueStr = data.paidValue.toFixed(2);
  const noteValueStr = data.noteValue.toFixed(2);

  const inspection = await prisma.inspection.create({
    data: {
      date: new Date(),
      paidValue: paidValueStr,
      noteValue: noteValueStr,
      customerId: customer.id,
      vehicleId: vehicle.id,
      createdById: userId,
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
    await enqueueInvoiceJob({ jobId: inspection.job.id }).catch(() => {});
  }

  return NextResponse.json({ ok: true, inspectionId: inspection.id });
}
