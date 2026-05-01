import Link from "next/link";
import type { SessionUser } from "@/lib/session";

export default function AppShell({ user, children }: { user: SessionUser; children: React.ReactNode }) {
  return (
    <div className="d-flex" style={{ minHeight: "100vh", background: "#f4f6f9" }}>
      <aside
        className="bg-white border-end"
        style={{ width: 280, position: "sticky", top: 0, height: "100vh" }}
      >
        <div className="p-4 border-bottom text-center">
          <img
            src="https://drive.google.com/thumbnail?id=1CrumSftM4zRqGe0jHIs04GGpOsEIITzT&sz=w300"
            alt="Logo Pissarro Vistorias"
            style={{ maxWidth: 180, height: "auto" }}
          />
          <div className="fw-bold mt-2" style={{ color: "#e63946", fontSize: 14, letterSpacing: 0.3 }}>
            Logo Pissarro Vistorias
          </div>
          <div className="text-muted" style={{ fontSize: 12 }}>
            {user.name}
          </div>
        </div>
        <div className="p-3">
          <nav className="nav nav-pills flex-column gap-2">
            <Link className="nav-link" href="/">
              <i className="bi bi-house-door me-2" />
              Tela Inicial
            </Link>
            <Link className="nav-link" href="/vistorias/nova">
              <i className="bi bi-file-earmark-plus me-2" />
              Nova Vistoria
            </Link>
            <Link className="nav-link" href="/vistorias">
              <i className="bi bi-table me-2" />
              Relação de Notas
            </Link>
            <Link className="nav-link" href="/financeiro">
              <i className="bi bi-graph-up-arrow me-2" />
              Financeiro
            </Link>
            <Link className="nav-link" href="/clientes">
              <i className="bi bi-people me-2" />
              Clientes
            </Link>
            {user.role === "ADMIN" ? (
              <Link className="nav-link" href="/administracao">
                <i className="bi bi-ui-checks-grid me-2" />
                Administração
              </Link>
            ) : null}
            {user.role === "ADMIN" ? (
              <Link className="nav-link" href="/automacao">
                <i className="bi bi-robot me-2" />
                Automação
              </Link>
            ) : null}
          </nav>
        </div>
        <div className="mt-auto p-3 border-top">
          <form action="/api/auth/logout" method="post">
            <button className="btn btn-outline-danger w-100" type="submit">
              <i className="bi bi-box-arrow-right me-2" />
              Sair
            </button>
          </form>
        </div>
      </aside>
      <main className="flex-grow-1 p-4 p-md-5">{children}</main>
    </div>
  );
}
