import { cookies } from "next/headers";
import { getIronSession, type IronSession, type SessionOptions } from "iron-session";

export type SessionUser = {
  id: string;
  email: string;
  name: string;
  role: "ADMIN" | "OPERADOR";
};

export type SessionData = {
  user?: SessionUser;
};

const password = process.env.SESSION_PASSWORD;

export const sessionOptions: SessionOptions = {
  password: password ?? "CHANGE_ME_TO_A_LONG_RANDOM_STRING_AT_LEAST_32_CHARS",
  cookieName: "vistori_session",
  cookieOptions: {
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    httpOnly: true,
    path: "/",
  },
};

export async function getSession(): Promise<IronSession<SessionData>> {
  const cookieStore = await cookies();
  return getIronSession<SessionData>(cookieStore, sessionOptions);
}
