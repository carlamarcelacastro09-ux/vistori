import AppShell from "@/components/AppShell";
import { prisma } from "@/lib/db";
import { requireUser } from "@/lib/auth";

export const dynamic = "force-dynamic";

function toBRL(value: number) {
  return value.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

export default async function Home() {
  const user = await requireUser();

  const tzNow = new Date();
  const startOfDay = new Date(tzNow.getFullYear(), tzNow.getMonth(), tzNow.getDate());
  const startOfMonth = new Date(tzNow.getFullYear(), tzNow.getMonth(), 1);

  const [day, month] = await Promise.all([
    prisma.inspection.aggregate({
      _sum: { paidValue: true },
      _count: { _all: true },
      where: { date: { gte: startOfDay } },
    }),
    prisma.inspection.aggregate({
      _sum: { paidValue: true },
      _count: { _all: true },
      where: { date: { gte: startOfMonth } },
    }),
  ]);

  const totalDay = Number(day._sum.paidValue ?? 0);
  const totalMonth = Number(month._sum.paidValue ?? 0);
  const qtdMonth = month._count._all ?? 0;

  return (
    <AppShell user={user}>
      <div className="mb-4">
        <h1 className="h3 fw-bold mb-1" style={{ color: "#2c3e50" }}>
          Tela Inicial
        </h1>
        <div className="text-muted">Gestão de vistorias e emissão automatizada de NFS-e.</div>
      </div>

      <div className="row g-4">
        <div className="col-md-4">
          <div className="card shadow-sm border-0" style={{ borderRadius: 12 }}>
            <div className="card-body">
              <div className="text-uppercase fw-bold text-danger" style={{ fontSize: 12 }}>
                Faturamento Hoje
              </div>
              <div className="display-6 fw-bold">{toBRL(totalDay)}</div>
            </div>
          </div>
        </div>
        <div className="col-md-4">
          <div className="card shadow-sm border-0" style={{ borderRadius: 12 }}>
            <div className="card-body">
              <div className="text-uppercase fw-bold text-primary" style={{ fontSize: 12 }}>
                Faturamento Mês
              </div>
              <div className="display-6 fw-bold">{toBRL(totalMonth)}</div>
            </div>
          </div>
        </div>
        <div className="col-md-4">
          <div className="card shadow-sm border-0" style={{ borderRadius: 12 }}>
            <div className="card-body">
              <div className="text-uppercase fw-bold text-warning" style={{ fontSize: 12 }}>
                Total Vistorias (mês)
              </div>
              <div className="display-6 fw-bold">{qtdMonth}</div>
            </div>
          </div>
        </div>
      </div>
    </AppShell>
  );
}
