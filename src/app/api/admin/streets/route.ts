import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { requireAdminSession } from "@/lib/admin-api";

export const dynamic = "force-dynamic";

const cepDigits = z
  .string()
  .transform((v) => String(v || "").replace(/\D/g, ""))
  .refine((v) => v.length === 8);

const createSchema = z.object({
  street: z.string().min(2).transform((v) => String(v || "").trim().toUpperCase()),
  district: z.string().min(1).transform((v) => String(v || "").trim().toUpperCase()),
  city: z.string().min(2).transform((v) => String(v || "").trim().toUpperCase()),
  cep: cepDigits,
});

export async function GET(req: Request) {
  const gate = await requireAdminSession();
  if (!gate.ok) return gate.res;

  const url = new URL(req.url);
  const q = (url.searchParams.get("query") || "").trim();

  const streets = await prisma.street.findMany({
    take: q ? 300 : 200,
    orderBy: [{ city: "asc" }, { street: "asc" }],
    where: q
      ? {
          OR: [
            { street: { contains: q, mode: "insensitive" } },
            { district: { contains: q, mode: "insensitive" } },
            { city: { contains: q, mode: "insensitive" } },
            { cep: { contains: q.replace(/\D/g, "") } },
          ],
        }
      : undefined,
    select: { id: true, street: true, district: true, city: true, cep: true, updatedAt: true },
  });

  return NextResponse.json({ ok: true, streets });
}

/** Cria nova rua ou substitui se já existir a combinação única street+district+city+cep */
export async function POST(req: Request) {
  const gate = await requireAdminSession();
  if (!gate.ok) return gate.res;

  const body = (await req.json().catch(() => null)) as unknown;
  const parsed = createSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ ok: false, message: "Verifique nome da rua, bairro, cidade e CEP (8 dígitos)." }, { status: 400 });
  }

  const d = parsed.data;
  const row = await prisma.street.upsert({
    where: {
      street_district_city_cep: {
        street: d.street,
        district: d.district,
        city: d.city,
        cep: d.cep,
      },
    },
    create: d,
    update: d,
    select: { id: true, street: true, district: true, city: true, cep: true, updatedAt: true },
  });

  return NextResponse.json({ ok: true, street: row });
}
