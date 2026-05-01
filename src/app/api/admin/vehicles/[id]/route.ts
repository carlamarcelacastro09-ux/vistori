import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { requireAdminSession } from "@/lib/admin-api";

export const dynamic = "force-dynamic";

const patchSchema = z.object({
  brand: z.string().min(1).transform((v) => String(v || "").trim().toUpperCase()),
  model: z.string().min(1).transform((v) => String(v || "").trim().toUpperCase()),
});

export async function PATCH(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const gate = await requireAdminSession();
  if (!gate.ok) return gate.res;

  const { id } = await ctx.params;
  const body = (await req.json().catch(() => null)) as unknown;
  const parsed = patchSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ ok: false, message: "Dados inválidos." }, { status: 400 });
  }

  const v = await prisma.vehicle.update({
    where: { id },
    data: parsed.data,
    select: { id: true, plate: true, brand: true, model: true, updatedAt: true },
  });

  return NextResponse.json({ ok: true, vehicle: v });
}
