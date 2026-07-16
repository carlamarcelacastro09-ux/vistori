import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { Prisma } from "@/generated/prisma/client";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  try {
    await requireAdmin();

    const { searchParams } = new URL(request.url);
    const month = searchParams.get("month");
    const status = searchParams.get("status") as "PENDENTE" | "PAGO" | null;

    const where: Prisma.AccountPayableWhereInput = {};

    if (month && /^\d{4}-\d{2}$/.test(month)) {
      const [year, m] = month.split("-").map(Number);
      const start = new Date(year, m - 1, 1);
      const end = new Date(year, m, 1);
      where.dueDate = { gte: start, lt: end };
    }

    if (status) {
      where.status = status;
    }

    const accounts = await prisma.accountPayable.findMany({
      where,
      orderBy: { dueDate: "asc" },
    });

    return NextResponse.json({ ok: true, accounts });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Erro interno";
    return NextResponse.json({ ok: false, message }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    await requireAdmin();

    const body = await request.json().catch(() => ({}));
    const description = typeof body.description === "string" ? body.description.trim() : "";
    const amount = typeof body.amount === "number" ? body.amount : Number(body.amount);
    const dueDate = typeof body.dueDate === "string" ? new Date(body.dueDate) : null;
    const category = typeof body.category === "string" ? body.category.trim() : null;

    if (!description || Number.isNaN(amount) || amount <= 0 || !dueDate || Number.isNaN(dueDate.getTime())) {
      return NextResponse.json({ ok: false, message: "Descrição, valor e vencimento são obrigatórios" }, { status: 400 });
    }

    const account = await prisma.accountPayable.create({
      data: {
        description,
        amount: new Prisma.Decimal(amount.toFixed(2)),
        dueDate,
        category: category ?? null,
        status: "PENDENTE",
      },
    });

    return NextResponse.json({ ok: true, account });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Erro interno";
    return NextResponse.json({ ok: false, message }, { status: 500 });
  }
}
