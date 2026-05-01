"use client";

import { useMemo, useState } from "react";

type Row = {
  id: string;
  date: string;
  plate: string;
  customerName: string;
  status: "AGUARDANDO" | "EMITIDA" | "ERRO";
  nfseNumber: string | null;
  errorMessage: string | null;
};

export default function VistoriasClient({ rows }: { rows: Row[] }) {
  const [query, setQuery] = useState("");
  const [status, setStatus] = useState<"" | Row["status"]>("");

  const filtered = useMemo(() => {
    const q = query.trim().toUpperCase();
    return rows.filter((r) => {
      if (status && r.status !== status) return false;
      if (!q) return true;
      const t = `${r.plate} ${r.customerName} ${r.nfseNumber ?? ""} ${r.errorMessage ?? ""}`.toUpperCase();
      return t.includes(q);
    });
  }, [rows, query, status]);

  const counts = useMemo(() => {
    const c = { AGUARDANDO: 0, EMITIDA: 0, ERRO: 0 };
    rows.forEach((r) => {
      c[r.status] += 1;
    });
    return c;
  }, [rows]);

  return (
    <div className="card shadow-sm border-0" style={{ borderRadius: 14 }}>
      <div className="card-body">
        <div className="d-flex flex-column flex-md-row justify-content-between align-items-md-center gap-3 mb-3">
          <div>
            <div className="fw-bold" style={{ color: "#2c3e50", fontSize: 18 }}>
              Relação de Notas
            </div>
            <div className="text-muted" style={{ fontSize: 13 }}>
              Acompanhe emissões, pendências e erros do robô.
            </div>
          </div>
          <div className="d-flex flex-wrap gap-2">
            <span className="badge text-bg-secondary">Aguardando: {counts.AGUARDANDO}</span>
            <span className="badge text-bg-success">Emitida: {counts.EMITIDA}</span>
            <span className="badge text-bg-danger">Erro: {counts.ERRO}</span>
          </div>
        </div>

        <div className="row g-3 align-items-end mb-3">
          <div className="col-md-6">
            <label className="form-label">Buscar</label>
            <input className="form-control" value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Placa, cliente, nº nota ou erro..." />
          </div>
          <div className="col-md-3">
            <label className="form-label">Status</label>
            <select
              className="form-select"
              value={status}
              onChange={(e) => {
                const v = e.target.value;
                if (v === "" || v === "AGUARDANDO" || v === "EMITIDA" || v === "ERRO") setStatus(v);
              }}
            >
              <option value="">Todos</option>
              <option value="AGUARDANDO">Aguardando</option>
              <option value="EMITIDA">Emitida</option>
              <option value="ERRO">Erro</option>
            </select>
          </div>
          <div className="col-md-3 text-md-end text-muted" style={{ fontSize: 13 }}>
            Mostrando: {filtered.length}
          </div>
        </div>

        <div className="table-responsive" style={{ maxHeight: "70vh" }}>
          <table className="table table-hover align-middle mb-0">
            <thead className="table-light" style={{ position: "sticky", top: 0, zIndex: 1 }}>
              <tr>
                <th>Data</th>
                <th>Placa</th>
                <th>Cliente</th>
                <th>Status</th>
                <th>Nº Nota / Erro</th>
              </tr>
            </thead>
            <tbody>
              {filtered.length === 0 ? (
                <tr>
                  <td colSpan={5} className="text-center text-muted p-5">
                    Nenhum registro.
                  </td>
                </tr>
              ) : (
                filtered.map((r) => {
                  const badge =
                    r.status === "EMITIDA" ? "bg-success" : r.status === "ERRO" ? "bg-danger" : "bg-secondary";
                  return (
                    <tr key={r.id}>
                      <td>{new Date(r.date).toLocaleDateString("pt-BR")}</td>
                      <td className="fw-bold">{r.plate || "-"}</td>
                      <td>{r.customerName}</td>
                      <td>
                        <span className={`badge ${badge}`}>{r.status}</span>
                      </td>
                      <td>
                        {r.status === "ERRO" ? (
                          <span className="text-danger fw-semibold">
                            <i className="bi bi-exclamation-triangle me-1" />
                            {r.errorMessage ?? "Erro"}
                          </span>
                        ) : (
                          <span className="fw-bold text-primary">{r.nfseNumber ?? "Aguardando"}</span>
                        )}
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
  );
}
