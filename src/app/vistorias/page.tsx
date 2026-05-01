import AppShell from "@/components/AppShell";
import { prisma } from "@/lib/db";
import { requireUser } from "@/lib/auth";
import VistoriasClient from "./VistoriasClient";

export const dynamic = "force-dynamic";

export default async function VistoriasPage() {
  const user = await requireUser();

  const inspections = await prisma.inspection.findMany({
    take: 200,
    orderBy: { createdAt: "desc" },
    include: { customer: true, vehicle: true },
  });

  return (
    <AppShell user={user}>
      <VistoriasClient
        rows={inspections.map((v) => ({
          id: v.id,
          date: v.date.toISOString(),
          plate: v.vehicle?.plate ?? "",
          customerName: v.customer.name,
          status: v.status,
          nfseNumber: v.nfseNumber ?? null,
          errorMessage: v.errorMessage ?? null,
        }))}
      />
    </AppShell>
  );
}
