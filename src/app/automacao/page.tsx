import AppShell from "@/components/AppShell";
import { requireAdmin } from "@/lib/auth";
import AutomationClient from "./AutomationClient";

export const dynamic = "force-dynamic";

export default async function AutomacaoPage() {
  const user = await requireAdmin();

  return (
    <AppShell user={user}>
      <div className="mb-4">
        <h1 className="h3 fw-bold mb-1" style={{ color: "#2c3e50" }}>
          Automação
        </h1>
        <div className="text-muted">Disparo manual dos processos automáticos.</div>
      </div>
      <AutomationClient />
    </AppShell>
  );
}

