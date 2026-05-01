import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getSession } from "@/lib/session";
import { cityKey } from "@/lib/normalize";

export async function GET(req: Request) {
  const session = await getSession();
  if (!session.user) return NextResponse.json({ ok: false }, { status: 401 });

  const url = new URL(req.url);
  const query = (url.searchParams.get("query") || "").trim();
  const city = (url.searchParams.get("city") || "").trim();

  if (query.length < 2) {
    return NextResponse.json({ ok: true, streets: [] });
  }

  const raw = await prisma.street.findMany({
    where: {
      street: {
        contains: query,
        mode: "insensitive",
      },
    },
    orderBy: [{ street: "asc" }],
    take: 80,
    select: {
      id: true,
      street: true,
      district: true,
      city: true,
      cep: true,
    },
  });

  const wantedCity = city ? cityKey(city) : "";
  const filtered = wantedCity ? raw.filter((r) => cityKey(r.city) === wantedCity) : raw;

  const seen = new Set<string>();
  const streets = [];
  for (const r of filtered) {
    const key = `${r.street}|${r.district}|${cityKey(r.city)}|${r.cep}`;
    if (seen.has(key)) continue;
    seen.add(key);
    streets.push(r);
    if (streets.length >= 10) break;
  }

  return NextResponse.json({ ok: true, streets });
}
