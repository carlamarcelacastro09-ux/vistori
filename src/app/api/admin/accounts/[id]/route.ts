import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { Prisma } from "@/generated/prisma/client";

export const dynamic = "force-dynamic";

type Params = { params: Promise<{ id: string }> };

export async function PUT(request: NextRequest, { params }: Params) {
  try {
    await requireAdmin();
    const { id } = await params;

    const body = await request.json().catch(() => ({}));
    const description = typeof body.description === "string" ? body.description.trim() : "";
    const amount = typeof body.amount === "number" ? body.amount : Number(body.amount);
    const dueDate = typeof body.dueDate === "string" ? new Date(body.dueDate) : null;
    const category = typeof body.category === "string" ? body.category.trim() : null;

    if (!description || Number.isNaN(amount) || amount <= 0 || !dueDate || Number.isNaN(dueDate.getTime())) {
      return NextResponse.json({ ok: false, message: "Descrição, valor e vencimento são obrigatórios" }, { status: 400 });
    }

    const account = await prisma.accountPayable.update({
      where: { id },
      data: {
        description,
        amount: new Prisma.Decimal(amount.toFixed(2)),
        dueDate,
        category: category ?? null,
      },
    });

    return NextResponse.json({ ok: true, account });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Erro interno";
    return NextResponse.json({ ok: false, message }, { status: 500 });
  }
}

export async function DELETE(_request: NextRequest, { params }: Params) {
  try {
    await requireAdmin();
    const { id } = await params;

    await prisma.accountPayable.delete({ where: { id } });
    return NextResponse.json({ ok: true });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Erro interno";
    return NextResponse.json({ ok: false, message }, { status: 500 });
  }
}

export async function PATCH(request: NextRequest, { params }: Params) {
  try {
    await requireAdmin();
    const { id } = await params;

    const body = await request.json().catch(() => ({}));
    const action = typeof body.action === "string" ? body.action : "";

    if (action === "pay") {
      const account = await prisma.accountPayable.update({
        where: { id },
        data: { status: "PAGO", paidAt: new Date() },
      });
      return NextResponse.json({ ok: true, account });
    }

    if (action === "unpay") {
      const account = await prisma.accountPayable.update({
        where: { id },
        data: { status: "PENDENTE", paidAt: null },
      });
      return NextResponse.json({ ok: true, account });
    }

    return NextResponse.json({ ok: false, message: "Ação inválida" }, { status: 400 });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Erro interno";
    return NextResponse.json({ ok: false, message }, { status: 500 });
  }
}
