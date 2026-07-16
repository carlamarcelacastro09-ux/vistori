import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { requireUser } from "@/lib/auth";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  try {
    const user = await requireUser();
    if (!user) return NextResponse.json({ ok: false, message: "Não autorizado" }, { status: 401 });

    const { searchParams } = new URL(request.url);
    const plate = searchParams.get("plate");
    if (!plate) {
      return NextResponse.json({ ok: false, message: "Placa obrigatória" }, { status: 400 });
    }

    const normalizedPlate = plate.toUpperCase().replace(/[^A-Z0-9]/g, "");

    // Data limite: 30 dias atrás
    const thirtyDaysAgo = new Date();
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
    thirtyDaysAgo.setHours(0, 0, 0, 0);

    const latest = await prisma.inspection.findFirst({
      where: {
        date: { gte: thirtyDaysAgo },
        vehicle: { plate: normalizedPlate },
      },
      orderBy: { date: "desc" },
      include: { vehicle: true },
    });

    return NextResponse.json({
      ok: true,
      hasRecentInspection: !!latest,
      lastDate: latest?.date?.toISOString() ?? null,
    });
  } catch (e) {
    console.error("plate-history error:", e);
    return NextResponse.json({ ok: false, message: "Erro interno" }, { status: 500 });
  }
}
