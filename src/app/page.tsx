import AppShell from "@/components/AppShell";
import { prisma } from "@/lib/db";
import { requireUser } from "@/lib/auth";
import Link from "next/link";

export const dynamic = "force-dynamic";

function toBRL(value: number) {
  return value.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

export default async function Home() {
  const user = await requireUser();

  const tzNow = new Date();
  const startOfDay = new Date(tzNow.getFullYear(), tzNow.getMonth(), tzNow.getDate());
  const startOfMonth = new Date(tzNow.getFullYear(), tzNow.getMonth(), 1);

  const [day, month, pending] = await Promise.all([
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
    prisma.inspection.count({ where: { status: "AGUARDANDO" } }),
  ]);

  const totalDay = Number(day._sum.paidValue ?? 0);
  const totalMonth = Number(month._sum.paidValue ?? 0);
  const qtdMonth = month._count._all ?? 0;

  const cards = [
    { label: "Faturamento Hoje", value: toBRL(totalDay), color: "#ef4444", icon: "bi-cash-coin" },
    { label: "Faturamento Mês", value: toBRL(totalMonth), color: "#2563eb", icon: "bi-calendar-month" },
    { label: "Vistorias no Mês", value: String(qtdMonth), color: "#f59e0b", icon: "bi-clipboard-check" },
    { label: "Pendentes", value: String(pending), color: "#64748b", icon: "bi-hourglass-split" },
  ];

  return (
    <AppShell user={user}>
      <div className="mb-4">
        <h1 className="h3 fw-bold mb-1" style={{ color: "var(--foreground)" }}>
          Olá, {user.name.split(" ")[0]}
        </h1>
        <div className="text-muted">Resumo do dia e acesso rápido.</div>
      </div>

      <div className="row g-4 mb-4">
        {cards.map((c) => (
          <div className="col-md-6 col-xl-3" key={c.label}>
            <div className="card h-100" style={{ borderRadius: 16, borderLeft: `4px solid ${c.color}` }}>
              <div className="card-body d-flex align-items-center py-3 px-3">
                <div
                  className="d-flex align-items-center justify-content-center flex-shrink-0 me-3"
                  style={{ width: 44, height: 44, borderRadius: 12, background: `${c.color}15` }}
                >
                  <i className={`bi ${c.icon}`} style={{ fontSize: 20, color: c.color }} />
                </div>
                <div>
                  <div style={{ fontSize: 12, fontWeight: 600, color: "var(--muted)", textTransform: "uppercase", letterSpacing: 0.5 }}>
                    {c.label}
                  </div>
                  <div className="fw-bold" style={{ fontSize: 22, color: "var(--foreground)" }}>{c.value}</div>
                </div>
              </div>
            </div>
          </div>
        ))}
      </div>

      <div className="row g-4">
        <div className="col-md-6">
          <div className="card h-100" style={{ borderRadius: 16 }}>
            <div className="card-body p-4">
              <h5 className="fw-bold mb-3" style={{ color: "var(--foreground)" }}>Acesso Rápido</h5>
              <div className="d-flex flex-wrap gap-2">
                <Link href="/vistorias/nova" className="btn btn-primary" style={{ borderRadius: 10 }}>
                  <i className="bi bi-plus-lg me-2" />Nova Vistoria
                </Link>
                <Link href="/vistorias" className="btn btn-outline-primary" style={{ borderRadius: 10 }}>
                  <i className="bi bi-table me-2" />Relação de Notas
                </Link>
              </div>
            </div>
          </div>
        </div>
        <div className="col-md-6">
          <div className="card h-100" style={{ borderRadius: 16 }}>
            <div className="card-body p-4">
              <h5 className="fw-bold mb-3" style={{ color: "var(--foreground)" }}>Status do Robô</h5>
              <div className="d-flex align-items-center gap-2">
                <span className="badge bg-success-subtle text-success border border-success-subtle">Ativo</span>
                <span className="text-muted" style={{ fontSize: 14 }}>Emissão automática às 18h</span>
              </div>
            </div>
          </div>
        </div>
      </div>
    </AppShell>
  );
}
