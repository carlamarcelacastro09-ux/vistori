import bcrypt from "bcryptjs";
import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { isNextProductionBuildPhase } from "@/lib/next-build-guard";

export const dynamic = "force-dynamic";

const bodySchema = z.object({
  email: z.string().email().transform((v) => v.toLowerCase()),
  password: z.string().min(6),
  name: z.string().min(2).optional().default("Administrador"),
});

export async function POST(req: Request) {
  if (isNextProductionBuildPhase()) {
    return NextResponse.json({ ok: false, message: "Indisponível durante o build." }, { status: 503 });
  }

  try {
    const pending = await prisma.user.count();

    const body = (await req.json().catch(() => null)) as unknown;
    const parsed = bodySchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json({ ok: false, message: "Verifique e-mail e senha (mín. 6 caracteres)." }, { status: 400 });
    }

    if (pending > 0) {
      return NextResponse.json(
        { ok: false, message: "Já existe usuário. Entre em /login." },
        { status: 403 },
      );
    }

    const passwordHash = await bcrypt.hash(parsed.data.password, 10);
    await prisma.user.create({
      data: {
        email: parsed.data.email,
        name: parsed.data.name.trim() || "Administrador",
        role: "ADMIN",
        passwordHash,
      },
    });

    return NextResponse.json({ ok: true });
  } catch {
    return NextResponse.json(
      {
        ok: false,
        message:
          "Não foi possível conectar ao banco. Na Vercel, confira se DATABASE_URL está configurada e se Neon está ativo.",
      },
      { status: 503 },
    );
  }
}
