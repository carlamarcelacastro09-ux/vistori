import AppShell from "@/components/AppShell";
import { requireAdmin } from "@/lib/auth";
import UsuariosClient from "./UsuariosClient";

export const dynamic = "force-dynamic";

export default async function UsuariosPage() {
  const user = await requireAdmin();

  return (
    <AppShell user={user}>
      <div className="mb-4">
        <h1 className="h3 fw-bold mb-1" style={{ color: "#2c3e50" }}>
          Usuários
        </h1>
        <div className="text-muted">Gerencie quem pode acessar o sistema.</div>
      </div>
      <UsuariosClient />
    </AppShell>
  );
}

