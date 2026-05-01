import bcrypt from "bcryptjs";
import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { getSession } from "@/lib/session";

const createUserSchema = z.object({
  email: z.string().email().transform((v) => v.toLowerCase()),
  name: z.string().min(2).transform((v) => String(v || "").trim()),
  password: z.string().min(6),
  role: z.enum(["ADMIN", "OPERADOR"]).optional().default("OPERADOR"),
});

export async function GET() {
  const session = await getSession();
  if (!session.user) return NextResponse.json({ ok: false }, { status: 401 });
  if (session.user.role !== "ADMIN") return NextResponse.json({ ok: false }, { status: 403 });

  const users = await prisma.user.findMany({
    orderBy: { createdAt: "desc" },
    select: { id: true, email: true, name: true, role: true, createdAt: true },
  });
  return NextResponse.json({ ok: true, users });
}

export async function POST(req: Request) {
  const session = await getSession();
  if (!session.user) return NextResponse.json({ ok: false }, { status: 401 });
  if (session.user.role !== "ADMIN") return NextResponse.json({ ok: false }, { status: 403 });

  const body = (await req.json().catch(() => null)) as unknown;
  const parsed = createUserSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ ok: false, message: "Dados inválidos." }, { status: 400 });
  }

  const passwordHash = await bcrypt.hash(parsed.data.password, 10);
  const user = await prisma.user.upsert({
    where: { email: parsed.data.email },
    create: {
      email: parsed.data.email,
      name: parsed.data.name,
      passwordHash,
      role: parsed.data.role,
    },
    update: {
      name: parsed.data.name,
      passwordHash,
      role: parsed.data.role,
    },
    select: { id: true, email: true, name: true, role: true, createdAt: true },
  });

  return NextResponse.json({ ok: true, user });
}

