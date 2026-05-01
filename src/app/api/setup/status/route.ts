import { NextResponse } from "next/server";
import { isNextProductionBuildPhase } from "@/lib/next-build-guard";

export const dynamic = "force-dynamic";

/** Usado só no cliente para mostrar/ocultar o cadastro do primeiro administrador na tela de login. */
export async function GET() {
  if (isNextProductionBuildPhase()) {
    return NextResponse.json({ ok: false, allowsFirstSignup: false, loading: false });
  }
  try {
    const { prisma } = await import("@/lib/db");
    const count = await prisma.user.count();
    return NextResponse.json({
      ok: true,
      allowsFirstSignup: count === 0,
      dbConnected: true,
    });
  } catch {
    return NextResponse.json({
      ok: false,
      allowsFirstSignup: false,
      dbConnected: false,
      message:
        "Não foi possível conectar ao banco. Configure DATABASE_URL na Vercel (Neon) e faça Redeploy.",
    });
  }
}
