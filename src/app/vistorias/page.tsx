import AppShell from "@/components/AppShell";
import { prisma } from "@/lib/db";
import { requireUser } from "@/lib/auth";
import VistoriasClient from "./VistoriasClient";

export const dynamic = "force-dynamic";

export default async function VistoriasPage() {
  const user = await requireUser();

  const [inspections, counts] = await Promise.all([
    prisma.inspection.findMany({
      orderBy: { createdAt: "desc" },
      include: { customer: true, vehicle: true },
    }),
    prisma.inspection.groupBy({
      by: ["status"],
      _count: { status: true },
    }),
  ]);

  const statusCount: Record<string, number> = {};
  for (const group of counts) {
    statusCount[group.status] = group._count.status;
  }

  const totalLancada = (statusCount.EMITIDA ?? 0) + (statusCount.LANCADO ?? 0);
  const totalAguardando = statusCount.AGUARDANDO ?? 0;
  const totalErro = statusCount.ERRO ?? 0;

  return (
    <AppShell user={user}>
      <VistoriasClient
        rows={inspections.map((v) => ({
          id: v.id,
          date: v.date?.toISOString() ?? "",
          plate: v.vehicle?.plate ?? "",
          vehicleBrand: v.vehicle?.brand ?? "",
          vehicleModel: v.vehicle?.model ?? "",
          customerName: v.customer?.name ?? "",
          customerDoc: v.customer?.doc ?? "",
          paidValue: Number(v.paidValue ?? 0),
          noteValue: Number(v.noteValue ?? 0),
          cep: v.customer?.cep ?? "",
          street: v.customer?.street ?? "",
          number: v.customer?.number ?? "",
          district: v.customer?.district ?? "",
          city: v.customer?.city ?? "",
          status: v.status,
          nfseNumber: v.nfseNumber ?? null,
          errorMessage: v.errorMessage ?? null,
        }))}
        totalAguardando={totalAguardando}
        totalLancada={totalLancada}
        totalErro={totalErro}
      />
    </AppShell>
  );
}
