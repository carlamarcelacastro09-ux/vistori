import AppShell from "@/components/AppShell";
import { requireUser } from "@/lib/auth";
import NewInspectionForm from "./NewInspectionForm";

export default async function NovaVistoriaPage() {
  const user = await requireUser();

  return (
    <AppShell user={user}>
      <div
        className="card border-0 shadow-sm mb-4"
        style={{
          borderRadius: 16,
          background: "linear-gradient(135deg, rgba(230,57,70,0.10), rgba(0,0,0,0.02))",
        }}
      >
        <div className="card-body d-flex flex-column flex-md-row justify-content-between align-items-md-center gap-3">
          <div>
            <h1 className="h3 fw-bold mb-1" style={{ color: "#2c3e50" }}>
              Nova Vistoria
            </h1>
            <div className="text-muted">Lançamento com validação (não permite salvar faltando dados).</div>
          </div>
          <div className="text-muted" style={{ fontSize: 13 }}>
            <i className="bi bi-shield-check me-2" />
            CEP/Bairro/Cidade são preenchidos pela rua
          </div>
        </div>
      </div>
      <NewInspectionForm />
    </AppShell>
  );
}
