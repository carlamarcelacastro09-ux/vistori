import AppShell from "@/components/AppShell";
import { prisma } from "@/lib/db";
import { requireUser } from "@/lib/auth";

export const dynamic = "force-dynamic";

function toBRL(value: number) {
  return value.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

export default async function FinanceiroPage() {
  const user = await requireUser();

  const now = new Date();
  const startOfDay = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);

  const [day, month, statusCounts, last] = await Promise.all([
    prisma.inspection.aggregate({
      _sum: { paidValue: true },
      where: { date: { gte: startOfDay } },
    }),
    prisma.inspection.aggregate({
      _sum: { paidValue: true },
      _count: { _all: true },
      where: { date: { gte: startOfMonth } },
    }),
    prisma.inspection.groupBy({
      by: ["status"],
      _count: { _all: true },
      where: { date: { gte: startOfMonth } },
    }),
    prisma.inspection.findMany({
      take: 15,
      orderBy: { createdAt: "desc" },
      include: { customer: true, vehicle: true },
    }),
  ]);

  const totalDay = Number(day._sum.paidValue ?? 0);
  const totalMonth = Number(month._sum.paidValue ?? 0);
  const qtdMonth = month._count._all ?? 0;
  const counts = {
    AGUARDANDO: statusCounts.find((s) => s.status === "AGUARDANDO")?._count._all ?? 0,
    EMITIDA: statusCounts.find((s) => s.status === "EMITIDA")?._count._all ?? 0,
    ERRO: statusCounts.find((s) => s.status === "ERRO")?._count._all ?? 0,
  };

  return (
    <AppShell user={user}>
      <div
        className="card border-0 shadow-sm mb-4"
        style={{
          borderRadius: 16,
          background: "linear-gradient(135deg, rgba(230,57,70,0.10), rgba(13,110,253,0.08))",
        }}
      >
        <div className="card-body d-flex flex-column flex-md-row justify-content-between align-items-md-center gap-3">
          <div>
            <h1 className="h3 fw-bold mb-1" style={{ color: "#2c3e50" }}>
              Financeiro
            </h1>
            <div className="text-muted">Somatório do valor pago informado na vistoria.</div>
          </div>
          <div className="d-flex flex-wrap gap-2">
            <span className="badge text-bg-secondary">Aguardando: {counts.AGUARDANDO}</span>
            <span className="badge text-bg-success">Emitida: {counts.EMITIDA}</span>
            <span className="badge text-bg-danger">Erro: {counts.ERRO}</span>
          </div>
        </div>
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

      <div className="card shadow-sm border-0 mt-4" style={{ borderRadius: 14 }}>
        <div className="card-body">
          <div className="fw-bold mb-2" style={{ color: "#2c3e50" }}>
            Últimas vistorias
          </div>
          <div className="table-responsive" style={{ maxHeight: "55vh" }}>
            <table className="table table-hover align-middle mb-0">
              <thead className="table-light" style={{ position: "sticky", top: 0, zIndex: 1 }}>
                <tr>
                  <th>Data</th>
                  <th>Placa</th>
                  <th>Cliente</th>
                  <th className="text-end">Valor</th>
                  <th>Status</th>
                </tr>
              </thead>
              <tbody>
                {last.length === 0 ? (
                  <tr>
                    <td colSpan={5} className="text-center text-muted p-4">
                      Nenhuma vistoria registrada.
                    </td>
                  </tr>
                ) : (
                  last.map((v) => {
                    const badge =
                      v.status === "EMITIDA" ? "bg-success" : v.status === "ERRO" ? "bg-danger" : "bg-secondary";
                    return (
                      <tr key={v.id}>
                        <td>{v.date.toLocaleDateString("pt-BR")}</td>
                        <td className="fw-semibold">{v.vehicle?.plate ?? "-"}</td>
                        <td>{v.customer.name}</td>
                        <td className="text-end fw-semibold">{toBRL(Number(v.paidValue))}</td>
                        <td>
                          <span className={`badge ${badge}`}>{v.status}</span>
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </AppShell>
  );
}
