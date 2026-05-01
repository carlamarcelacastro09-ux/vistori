import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { requireAdminSession } from "@/lib/admin-api";

export const dynamic = "force-dynamic";

const cepDigits = z
  .string()
  .transform((v) => String(v || "").replace(/\D/g, ""))
  .refine((v) => v.length === 8);

const patchSchema = z.object({
  street: z.string().min(2).transform((v) => String(v || "").trim().toUpperCase()),
  district: z.string().min(1).transform((v) => String(v || "").trim().toUpperCase()),
  city: z.string().min(2).transform((v) => String(v || "").trim().toUpperCase()),
  cep: cepDigits,
});

/** Atualização por id (pode conflitar com unique se duplicar outra linha) */
export async function PATCH(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const gate = await requireAdminSession();
  if (!gate.ok) return gate.res;

  const { id } = await ctx.params;
  const body = (await req.json().catch(() => null)) as unknown;
  const parsed = patchSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ ok: false, message: "Dados inválidos." }, { status: 400 });
  }

  try {
    const row = await prisma.street.update({
      where: { id },
      data: parsed.data,
      select: { id: true, street: true, district: true, city: true, cep: true, updatedAt: true },
    });
    return NextResponse.json({ ok: true, street: row });
  } catch {
    return NextResponse.json(
      { ok: false, message: "Não foi possível salvar. Pode já existir outra rua igual (rua+bairro+cidade+cep)." },
      { status: 409 },
    );
  }
}
