import Link from "next/link";
import type { SessionUser } from "@/lib/session";

const nav = [
  { href: "/", icon: "bi-house-door", label: "Tela Inicial" },
  { href: "/vistorias/nova", icon: "bi-file-earmark-plus", label: "Nova Vistoria" },
  { href: "/vistorias", icon: "bi-table", label: "Relação de Notas" },
  { href: "/financeiro", icon: "bi-graph-up-arrow", label: "Financeiro" },
  { href: "/clientes", icon: "bi-people", label: "Clientes" },
];

const adminNav = [
  { href: "/administracao", icon: "bi-ui-checks-grid", label: "Administração" },
];

export default function AppShell({ user, children }: { user: SessionUser; children: React.ReactNode }) {
  return (
    <div className="d-flex" style={{ minHeight: "100vh" }}>
      <aside
        className="bg-white border-end d-flex flex-column"
        style={{ width: 260, position: "sticky", top: 0, height: "100vh" }}
      >
        <div className="p-4 text-center border-bottom" style={{ borderColor: "var(--border)" }}>
          <img
            src="https://drive.google.com/thumbnail?id=1CrumSftM4zRqGe0jHIs04GGpOsEIITzT&sz=w300"
            alt="Pissarro Vistorias"
            style={{ maxWidth: 160, height: "auto" }}
          />
          <div className="fw-bold mt-2" style={{ color: "var(--foreground)", fontSize: 15, letterSpacing: 0.3 }}>
            Pissarro Vistorias
          </div>
          <div className="text-muted" style={{ fontSize: 12 }}>
            {user.name}
          </div>
        </div>
        <div className="p-3 flex-grow-1 overflow-auto">
          <nav className="nav nav-pills flex-column gap-1">
            {nav.map((item) => (
              <Link
                key={item.href}
                className="nav-link d-flex align-items-center rounded-3"
                href={item.href}
                style={{ color: "var(--foreground)", fontWeight: 500, fontSize: 14 }}
              >
                <i className={`bi ${item.icon} me-3`} style={{ fontSize: 16 }} />
                {item.label}
              </Link>
            ))}
            {user.role === "ADMIN" ? (
              <>
                <div className="mt-3 mb-1 text-uppercase" style={{ fontSize: 10, fontWeight: 600, color: "var(--muted)", paddingLeft: 12 }}>
                  Admin
                </div>
                {adminNav.map((item) => (
                  <Link
                    key={item.href}
                    className="nav-link d-flex align-items-center rounded-3"
                    href={item.href}
                    style={{ color: "var(--foreground)", fontWeight: 500, fontSize: 14 }}
                  >
                    <i className={`bi ${item.icon} me-3`} style={{ fontSize: 16 }} />
                    {item.label}
                  </Link>
                ))}
              </>
            ) : null}
          </nav>
        </div>
        <div className="p-3 border-top" style={{ borderColor: "var(--border)" }}>
          <form action="/api/auth/logout" method="post">
            <button className="btn btn-outline-danger w-100" type="submit" style={{ borderRadius: 10, fontSize: 14 }}>
              <i className="bi bi-box-arrow-right me-2" />
              Sair
            </button>
          </form>
        </div>
      </aside>
      <main className="flex-grow-1 p-4 p-md-5" style={{ background: "var(--background)" }}>
        {children}
      </main>
    </div>
  );
}
