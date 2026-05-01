import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getSession } from "@/lib/session";

export async function GET() {
  const session = await getSession();
  if (!session.user) return NextResponse.json({ ok: false }, { status: 401 });

  const now = new Date();
  const startOfDay = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);

  const [day, month] = await Promise.all([
    prisma.inspection.aggregate({
      _sum: { paidValue: true },
      where: { date: { gte: startOfDay } },
    }),
    prisma.inspection.aggregate({
      _sum: { paidValue: true },
      _count: { _all: true },
      where: { date: { gte: startOfMonth } },
    }),
  ]);

  return NextResponse.json({
    ok: true,
    dia: Number(day._sum.paidValue ?? 0),
    mes: Number(month._sum.paidValue ?? 0),
    qtd: month._count._all ?? 0,
  });
}

