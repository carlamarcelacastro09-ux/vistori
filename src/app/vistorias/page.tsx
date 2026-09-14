import AppShell from "@/components/AppShell";
import { prisma } from "@/lib/db";
import { requireUser } from "@/lib/auth";
import VistoriasClient from "./VistoriasClient";

export const dynamic = "force-dynamic";

export default async function VistoriasPage() {
  const user = await requireUser();

  const [rawInspections, counts] = await Promise.all([
    prisma.inspection.findMany({
      orderBy: { date: "desc" },
      include: { customer: true, vehicle: true },
    }),
    prisma.inspection.groupBy({
      by: ["status"],
      _count: { status: true },
    }),
  ]);

  const inspections = [...rawInspections].sort((a, b) => {
    const dateDiff = new Date(b.date).getTime() - new Date(a.date).getTime();
    if (dateDiff !== 0) return dateDiff;
    if (!a.nfseNumber && !b.nfseNumber) return 0;
    if (!a.nfseNumber) return 1;
    if (!b.nfseNumber) return -1;
    const na = parseInt(a.nfseNumber, 10);
    const nb = parseInt(b.nfseNumber, 10);
    if (isNaN(na) || isNaN(nb)) return b.nfseNumber.localeCompare(a.nfseNumber);
    return nb - na;
  });

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
          plate: v.vehiclePlate ?? v.vehicle?.plate ?? "",
          vehicleBrand: v.vehicleBrand ?? v.vehicle?.brand ?? "",
          vehicleModel: v.vehicleModel ?? v.vehicle?.model ?? "",
          customerName: v.customerName ?? v.customer?.name ?? "",
          customerDoc: v.customerDoc ?? v.customer?.doc ?? "",
          paidValue: Number(v.paidValue ?? 0),
          noteValue: Number(v.noteValue ?? 0),
          cep: v.customerCep ?? v.customer?.cep ?? "",
          street: v.customerStreet ?? v.customer?.street ?? "",
          number: v.customerNumber ?? v.customer?.number ?? "",
          district: v.customerDistrict ?? v.customer?.district ?? "",
          city: v.customerCity ?? v.customer?.city ?? "",
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
