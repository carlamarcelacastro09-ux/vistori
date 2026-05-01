import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getSession } from "@/lib/session";

export async function GET(req: Request) {
  const session = await getSession();
  if (!session.user) return NextResponse.json({ ok: false }, { status: 401 });

  const url = new URL(req.url);
  const doc = (url.searchParams.get("doc") || "").replace(/\D/g, "");
  if (doc.length !== 11 && doc.length !== 14) {
    return NextResponse.json({ ok: true, customer: null });
  }

  const customer = await prisma.customer.findUnique({
    where: { doc },
    select: {
      doc: true,
      name: true,
      street: true,
      number: true,
      district: true,
      city: true,
      cep: true,
    },
  });

  return NextResponse.json({ ok: true, customer: customer ?? null });
}

