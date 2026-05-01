import AppShell from "@/components/AppShell";
import { requireAdmin } from "@/lib/auth";
import { prisma } from "@/lib/db";
import AdministracaoClient from "./AdministracaoClient";

export const dynamic = "force-dynamic";

export default async function AdministracaoPage() {
  const user = await requireAdmin();

  const [customers, vehicles, streets, users] = await Promise.all([
    prisma.customer.count(),
    prisma.vehicle.count(),
    prisma.street.count(),
    prisma.user.count(),
  ]);

  return (
    <AppShell user={user}>
      <AdministracaoClient counts={{ customers, vehicles, streets, users }} />
    </AppShell>
  );
}
