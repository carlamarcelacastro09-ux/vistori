import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { requireAdminSession } from "@/lib/admin-api";

export const dynamic = "force-dynamic";

const digitsPlate = z
  .string()
  .transform((v) => String(v || "").replace(/\s/g, "").toUpperCase().replace(/[^A-Z0-9]/g, ""))
  .refine((v) => v.length >= 7 && v.length <= 10);

const createSchema = z.object({
  plate: digitsPlate,
  brand: z.string().min(1).transform((v) => String(v || "").trim().toUpperCase()),
  model: z.string().min(1).transform((v) => String(v || "").trim().toUpperCase()),
});

export async function GET(req: Request) {
  const gate = await requireAdminSession();
  if (!gate.ok) return gate.res;

  const url = new URL(req.url);
  const q = (url.searchParams.get("query") || "").trim().toUpperCase();

  const vehicles = await prisma.vehicle.findMany({
    take: 500,
    orderBy: { plate: "asc" },
    where: q
      ? {
          OR: [
            { plate: { contains: q } },
            { brand: { contains: q, mode: "insensitive" } },
            { model: { contains: q, mode: "insensitive" } },
          ],
        }
      : undefined,
    select: { id: true, plate: true, brand: true, model: true, updatedAt: true },
  });

  return NextResponse.json({ ok: true, vehicles });
}

export async function POST(req: Request) {
  const gate = await requireAdminSession();
  if (!gate.ok) return gate.res;

  const body = (await req.json().catch(() => null)) as unknown;
  const parsed = createSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ ok: false, message: "Verifique placa, marca e modelo." }, { status: 400 });
  }

  const v = await prisma.vehicle.upsert({
    where: { plate: parsed.data.plate },
    create: parsed.data,
    update: { brand: parsed.data.brand, model: parsed.data.model },
    select: { id: true, plate: true, brand: true, model: true, updatedAt: true },
  });

  return NextResponse.json({ ok: true, vehicle: v });
}
