"use client";

import { useState } from "react";

export default function AutomationClient() {
  const [loading, setLoading] = useState<null | "import" | "robot">(null);
  const [message, setMessage] = useState<string | null>(null);

  async function dispatch(workflow: "import" | "robot") {
    setLoading(workflow);
    setMessage(null);

    const res = await fetch("/api/admin/automation/dispatch", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ workflow }),
    }).catch(() => null);

    setLoading(null);

    if (!res) {
      setMessage("Falha de conexão.");
      return;
    }

    const data = (await res.json().catch(() => null)) as { ok?: boolean; message?: string } | null;
    if (!res.ok || !data?.ok) {
      setMessage(data?.message ?? "Não foi possível disparar.");
      return;
    }

    setMessage(data?.message ?? "Processo iniciado em segundo plano.");
  }

  return (
    <div className="row g-4">
      <div className="col-lg-7">
        <div className="card shadow-sm border-0" style={{ borderRadius: 14 }}>
          <div className="card-body">
            <div className="fw-bold mb-1" style={{ color: "#2c3e50", fontSize: 18 }}>
              Automação
            </div>
            <div className="text-muted mb-3" style={{ fontSize: 13 }}>
              Dispare importação da planilha e/ou o robô sob demanda.
            </div>

            {message ? <div className="alert alert-info py-2">{message}</div> : null}

            <div className="d-flex flex-column flex-md-row gap-2">
              <button className="btn btn-outline-secondary" type="button" onClick={() => dispatch("import")} disabled={loading !== null}>
                {loading === "import" ? "Disparando..." : "Importar planilha agora"}
              </button>
              <button className="btn btn-danger" type="button" onClick={() => dispatch("robot")} disabled={loading !== null}>
                {loading === "robot" ? "Disparando..." : "Rodar robô agora"}
              </button>
            </div>
          </div>
        </div>
      </div>

      <div className="col-lg-5">
        <div className="card shadow-sm border-0" style={{ borderRadius: 14 }}>
          <div className="card-body">
            <div className="fw-bold mb-2" style={{ color: "#2c3e50" }}>
              Observações
            </div>
            <ul className="text-muted mb-0" style={{ fontSize: 13 }}>
              <li>O botão inicia o robô ou a importação diretamente neste computador/servidor.</li>
              <li>O robô só processa registros completos (endereço + veículo).</li>
              <li>Use quando quiser “forçar” a rodada sem esperar o horário do cron.</li>
            </ul>
          </div>
        </div>
      </div>
    </div>
  );
}

