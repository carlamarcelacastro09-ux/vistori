import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getSession } from "@/lib/session";

export async function GET(req: Request) {
  const session = await getSession();
  if (!session.user) return NextResponse.json({ ok: false }, { status: 401 });

  const url = new URL(req.url);
  const model = (url.searchParams.get("model") || "").trim().toUpperCase();
  if (model.length < 2) return NextResponse.json({ ok: true, vehicle: null });

  const vehicle = await prisma.vehicleCatalog.findUnique({
    where: { model },
    select: { model: true, brand: true },
  });

  return NextResponse.json({ ok: true, vehicle: vehicle ?? null });
}
