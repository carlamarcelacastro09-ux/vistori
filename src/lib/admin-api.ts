import { NextResponse } from "next/server";
import type { IronSession } from "iron-session";
import { getSession, type SessionData } from "@/lib/session";

export async function requireAdminSession(): Promise<{ ok: true; session: IronSession<SessionData> } | { ok: false; res: Response }> {
  const session = await getSession();
  if (!session.user) {
    return { ok: false, res: NextResponse.json({ ok: false, message: "Não autorizado." }, { status: 401 }) };
  }
  if (session.user.role !== "ADMIN") {
    return { ok: false, res: NextResponse.json({ ok: false, message: "Apenas administrador." }, { status: 403 }) };
  }
  return { ok: true, session };
}
