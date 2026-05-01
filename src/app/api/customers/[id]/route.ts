import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { getSession } from "@/lib/session";

const updateCustomerSchema = z.object({
  doc: z.string().transform((v) => String(v || "").replace(/\D/g, "")).refine((v) => v.length === 11 || v.length === 14),
  name: z.string().min(3).transform((v) => String(v || "").trim().toUpperCase()),
  street: z.string().optional().default("").transform((v) => String(v || "").trim().toUpperCase()),
  number: z.string().optional().default("").transform((v) => String(v || "").trim().toUpperCase()),
  district: z.string().optional().default("").transform((v) => String(v || "").trim().toUpperCase()),
  city: z.string().optional().default("").transform((v) => String(v || "").trim().toUpperCase()),
  cep: z.string().optional().default("").transform((v) => String(v || "").replace(/\D/g, "")),
});

export async function PATCH(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const session = await getSession();
  if (!session.user) return NextResponse.json({ ok: false }, { status: 401 });

  const { id } = await ctx.params;
  const body = (await req.json().catch(() => null)) as unknown;
  const parsed = updateCustomerSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ ok: false, message: "Dados inválidos." }, { status: 400 });
  }

  const updated = await prisma.customer.update({
    where: { id },
    data: parsed.data,
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

  return NextResponse.json({ ok: true, customer: updated });
}

