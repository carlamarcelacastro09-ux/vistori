import AppShell from "@/components/AppShell";
import { prisma } from "@/lib/db";
import { requireUser } from "@/lib/auth";
import FinanceiroClient from "./FinanceiroClient";

export const dynamic = "force-dynamic";

export default async function FinanceiroPage() {
  const user = await requireUser();

  const now = new Date();
  const startOfDay = new Date(now.getFullYear(), now.getMonth(), now.getDate());

  const [day, inspections, accounts] = await Promise.all([
    prisma.inspection.aggregate({
      _sum: { paidValue: true },
      where: { date: { gte: startOfDay } },
    }),
    prisma.inspection.findMany({
      orderBy: { createdAt: "desc" },
      include: { customer: true, vehicle: true },
    }),
    prisma.accountPayable.findMany({
      orderBy: { dueDate: "asc" },
    }),
  ]);

  const totalDay = Number(day._sum.paidValue ?? 0);

  const rows = inspections.map((v) => ({
    id: v.id,
    date: v.date.toISOString(),
    plate: v.vehicle?.plate ?? "",
    customerName: v.customer?.name ?? "",
    paidValue: Number(v.paidValue ?? 0),
    status: v.status,
  }));

  const accountRows = accounts.map((a) => ({
    id: a.id,
    description: a.description,
    amount: Number(a.amount),
    dueDate: a.dueDate.toISOString(),
    status: a.status,
    category: a.category ?? "",
    paidAt: a.paidAt?.toISOString() ?? null,
  }));

  return (
    <AppShell user={user}>
      <FinanceiroClient rows={rows} totalDay={totalDay} initialAccounts={accountRows} />
    </AppShell>
  );
}
