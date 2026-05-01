import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getSession } from "@/lib/session";
import { cityKey, titleCase } from "@/lib/normalize";

export async function GET() {
  const session = await getSession();
  if (!session.user) return NextResponse.json({ ok: false }, { status: 401 });

  const rows = await prisma.street.findMany({
    distinct: ["city"],
    select: { city: true },
  });

  const map = new Map<string, string>();
  for (const r of rows) {
    const raw = String(r.city || "").trim();
    if (!raw) continue;
    const key = cityKey(raw);
    if (!key) continue;
    if (!map.has(key)) map.set(key, titleCase(key));
  }

  const cities = Array.from(map.values()).sort((a, b) => a.localeCompare(b, "pt-BR"));
  return NextResponse.json({ ok: true, cities });
}
