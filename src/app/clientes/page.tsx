import AppShell from "@/components/AppShell";
import { requireUser } from "@/lib/auth";
import CustomersClient from "./CustomersClient";

export const dynamic = "force-dynamic";

export default async function ClientesPage() {
  const user = await requireUser();

  return (
    <AppShell user={user}>
      <div className="mb-4">
        <h1 className="h3 fw-bold mb-1" style={{ color: "#2c3e50" }}>
          Clientes
        </h1>
        <div className="text-muted">Cadastro e atualização manual de clientes.</div>
      </div>
      <CustomersClient />
    </AppShell>
  );
}

