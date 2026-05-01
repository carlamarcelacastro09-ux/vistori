import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { getSession } from "@/lib/session";

const createCustomerSchema = z.object({
  doc: z.string().transform((v) => String(v || "").replace(/\D/g, "")).refine((v) => v.length === 11 || v.length === 14),
  name: z.string().min(3).transform((v) => String(v || "").trim().toUpperCase()),
  street: z.string().optional().default("").transform((v) => String(v || "").trim().toUpperCase()),
  number: z.string().optional().default("").transform((v) => String(v || "").trim().toUpperCase()),
  district: z.string().optional().default("").transform((v) => String(v || "").trim().toUpperCase()),
  city: z.string().optional().default("").transform((v) => String(v || "").trim().toUpperCase()),
  cep: z.string().optional().default("").transform((v) => String(v || "").replace(/\D/g, "")),
});

export async function GET(req: Request) {
  const session = await getSession();
  if (!session.user) return NextResponse.json({ ok: false }, { status: 401 });

  const url = new URL(req.url);
  const q = (url.searchParams.get("query") || "").trim().toUpperCase();

  const customers = await prisma.customer.findMany({
    take: 200,
    orderBy: { updatedAt: "desc" },
    where: q
      ? {
          OR: [
            { name: { contains: q, mode: "insensitive" } },
            { doc: { contains: q.replace(/\D/g, "") } },
          ],
        }
      : undefined,
    select: {
      id: true,
      doc: true,
      name: true,
      street: true,
      number: true,
      district: true,
      city: true,
      cep: true,
      updatedAt: true,
    },
  });

  return NextResponse.json({ ok: true, customers });
}

export async function POST(req: Request) {
  const session = await getSession();
  if (!session.user) return NextResponse.json({ ok: false }, { status: 401 });

  const body = (await req.json().catch(() => null)) as unknown;
  const parsed = createCustomerSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ ok: false, message: "Dados inválidos." }, { status: 400 });
  }

  const created = await prisma.customer.upsert({
    where: { doc: parsed.data.doc },
    create: parsed.data,
    update: parsed.data,
    select: {
      id: true,
      doc: true,
      name: true,
      street: true,
      number: true,
      district: true,
      city: true,
      cep: true,
      updatedAt: true,
    },
  });

  return NextResponse.json({ ok: true, customer: created });
}

