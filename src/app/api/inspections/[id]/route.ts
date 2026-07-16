import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/lib/session";
import { prisma } from "@/lib/db";
import { Prisma } from "@/generated/prisma/client";
import { updateInspectionSchema } from "@/lib/validation";
import { cityKey } from "@/lib/normalize";

export const dynamic = "force-dynamic";

type Params = { params: Promise<{ id: string }> };

export async function PATCH(request: NextRequest, { params }: Params) {
  try {
    const session = await getSession();
    if (!session.user) {
      return NextResponse.json({ ok: false, message: "Não autorizado." }, { status: 401 });
    }

    const { id } = await params;
    const body = await request.json().catch(() => ({}));
    const parsed = updateInspectionSchema.safeParse(body);
    if (!parsed.success) {
      const issues = parsed.error.issues;
      const fields: Record<string, string> = {};
      for (const issue of issues) {
        const key = issue.path[0];
        if (typeof key === "string" && !fields[key]) fields[key] = issue.message;
      }
      return NextResponse.json({ ok: false, message: "Dados inválidos.", fields }, { status: 400 });
    }

    const data = parsed.data;

    const existing = await prisma.inspection.findUnique({
      where: { id },
      include: { customer: true, vehicle: true, job: true },
    });
    if (!existing) {
      return NextResponse.json({ ok: false, message: "Vistoria não encontrada." }, { status: 404 });
    }

    let customerId = existing.customerId;
    let vehicleId: string | null = existing.vehicleId;

    if (data.customerDoc !== undefined) {
      if (
        !data.customerName ||
        !data.cep ||
        !data.street ||
        !data.number ||
        !data.district ||
        !data.city
      ) {
        return NextResponse.json(
          { ok: false, message: "Preencha todos os dados do cliente e endereço." },
          { status: 400 },
        );
      }
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
      customerId = customer.id;
    }

    if (data.plate !== undefined) {
      if (!data.vehicleBrand || !data.vehicleModel) {
        return NextResponse.json(
          { ok: false, message: "Preencha marca e modelo do veículo." },
          { status: 400 },
        );
      }
      const vehicle = await prisma.vehicle.upsert({
        where: { plate: data.plate },
        create: { plate: data.plate, brand: data.vehicleBrand, model: data.vehicleModel },
        update: { brand: data.vehicleBrand, model: data.vehicleModel },
      });
      vehicleId = vehicle.id;

      await prisma.vehicleCatalog.upsert({
        where: { model: data.vehicleModel },
        create: { model: data.vehicleModel, brand: data.vehicleBrand },
        update: { brand: data.vehicleBrand },
      });
    }

    const inspectionData: any = {};
    if (data.paidValue !== undefined) {
      inspectionData.paidValue = new Prisma.Decimal(data.paidValue.toFixed(2));
    }
    if (data.noteValue !== undefined) {
      inspectionData.noteValue = new Prisma.Decimal(data.noteValue.toFixed(2));
    }
    if (data.date !== undefined) {
      const date = new Date(data.date);
      if (Number.isNaN(date.getTime())) {
        return NextResponse.json({ ok: false, message: "Data inválida." }, { status: 400 });
      }
      inspectionData.date = date;
    }
    if (data.status !== undefined) {
      inspectionData.status = data.status;
    }
    if (data.nfseNumber !== undefined) {
      inspectionData.nfseNumber = data.nfseNumber;
    }
    if (data.errorMessage !== undefined) {
      inspectionData.errorMessage = data.errorMessage;
    }
    if (customerId !== undefined) {
      inspectionData.customerId = customerId;
    }
    if (vehicleId !== undefined) {
      inspectionData.vehicleId = vehicleId;
    }

    const shouldReset = data.status === "AGUARDANDO" && existing.status !== "AGUARDANDO";
    if (shouldReset) {
      inspectionData.nfseNumber = null;
      inspectionData.errorMessage = null;
    }

    const transactionOps: any[] = [
      prisma.inspection.update({
        where: { id },
        data: inspectionData,
        include: { customer: true, vehicle: true },
      }),
    ];

    if (data.street !== undefined && data.district !== undefined && data.city !== undefined && data.cep !== undefined) {
      const city = cityKey(data.city);
      transactionOps.push(
        prisma.street.upsert({
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
        }),
      );
    }

    if (shouldReset) {
      if (existing.job) {
        transactionOps.push(
          prisma.invoiceJob.update({
            where: { id: existing.job.id },
            data: { status: "FILA", lastError: null, attempts: 0 },
          }),
        );
      } else {
        transactionOps.push(
          prisma.invoiceJob.create({
            data: { inspectionId: id, status: "FILA", attempts: 0 },
          }),
        );
      }
    }

    const [inspection] = await prisma.$transaction(transactionOps);

    return NextResponse.json({ ok: true, inspection });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Erro interno";
    return NextResponse.json({ ok: false, message }, { status: 500 });
  }
}
