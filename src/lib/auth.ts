import { redirect } from "next/navigation";
import { getSession } from "@/lib/session";

export async function requireUser() {
  const session = await getSession();
  if (!session.user) redirect("/login");
  return session.user;
}

export async function requireAdmin() {
  const user = await requireUser();
  if (user.role !== "ADMIN") redirect("/");
  return user;
}

export async function getUser() {
  const session = await getSession();
  return session.user ?? null;
}
