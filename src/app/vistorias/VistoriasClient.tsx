"use client";

import { useEffect, useMemo, useState } from "react";

type Row = {
  id: string;
  date: string;
  plate: string;
  vehicleBrand: string;
  vehicleModel: string;
  customerName: string;
  customerDoc: string;
  paidValue: number;
  noteValue: number;
  cep: string;
  street: string;
  number: string;
  district: string;
  city: string;
  status: "AGUARDANDO" | "EMITIDA" | "LANCADO" | "ERRO";
  nfseNumber: string | null;
  errorMessage: string | null;
};

const PAGE_SIZE = 15;
const STATUS_OPTIONS: { value: Row["status"] | ""; label: string; variant: string }[] = [
  { value: "", label: "Todos", variant: "outline-secondary" },
  { value: "AGUARDANDO", label: "Aguardando", variant: "outline-secondary" },
  { value: "LANCADO", label: "Lançadas", variant: "outline-success" },
  { value: "ERRO", label: "Erros", variant: "outline-danger" },
];

function toBRDate(iso: string) {
  if (!iso) return "-";
  return new Date(iso).toLocaleDateString("pt-BR");
}

function toBRL(value: number) {
  return value.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

function formatDoc(doc: string) {
  const d = doc.replace(/\D/g, "");
  if (d.length === 11) return d.replace(/(\d{3})(\d{3})(\d{3})(\d{2})/, "$1.$2.$3-$4");
  if (d.length === 14) return d.replace(/(\d{2})(\d{3})(\d{3})(\d{4})(\d{2})/, "$1.$2.$3/$4-$5");
  return doc;
}

function escapeCSV(v: string) {
  const s = String(v ?? "");
  if (s.includes(";") || s.includes('"') || s.includes("\n")) {
    return `"${s.replace(/"/g, '""')}"`;
  }
  return s;
}

export default function VistoriasClient({
  rows,
  totalAguardando,
  totalLancada,
  totalErro,
}: {
  rows: Row[];
  totalAguardando: number;
  totalLancada: number;
  totalErro: number;
}) {
  const [query, setQuery] = useState("");
  const [status, setStatus] = useState<"" | Row["status"]>("");
  const [page, setPage] = useState(1);
  const [selected, setSelected] = useState<Row | null>(null);
  const [data, setData] = useState<Row[]>(rows);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editingValue, setEditingValue] = useState("");
  const [editingSaving, setEditingSaving] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);

  const [form, setForm] = useState({
    date: "",
    plate: "",
    vehicleBrand: "",
    vehicleModel: "",
    customerName: "",
    customerDoc: "",
    paidValue: "",
    noteValue: "",
    cep: "",
    street: "",
    number: "",
    district: "",
    city: "",
    status: "AGUARDANDO" as Row["status"],
    nfseNumber: "",
    errorMessage: "",
  });
  const [formSaving, setFormSaving] = useState(false);

  useEffect(() => {
    setData(rows);
  }, [rows]);

  useEffect(() => {
    if (selected) {
      setForm({
        date: selected.date.slice(0, 10),
        plate: selected.plate,
        vehicleBrand: selected.vehicleBrand,
        vehicleModel: selected.vehicleModel,
        customerName: selected.customerName,
        customerDoc: formatDoc(selected.customerDoc),
        paidValue: selected.paidValue.toFixed(2),
        noteValue: selected.noteValue.toFixed(2),
        cep: selected.cep,
        street: selected.street,
        number: selected.number,
        district: selected.district,
        city: selected.city,
        status: selected.status,
        nfseNumber: selected.nfseNumber ?? "",
        errorMessage: selected.errorMessage ?? "",
      });
    }
  }, [selected]);

  const filtered = useMemo(() => {
    const q = query.trim().toUpperCase();
    return data.filter((r) => {
      if (status && r.status !== status) return false;
      if (!q) return true;
      const t = `${r.plate} ${r.vehicleBrand} ${r.vehicleModel} ${r.customerName} ${r.customerDoc} ${r.nfseNumber ?? ""} ${r.errorMessage ?? ""}`.toUpperCase();
      return t.includes(q);
    });
  }, [data, query, status]);

  const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const paged = useMemo(() => {
    const start = (page - 1) * PAGE_SIZE;
    return filtered.slice(start, start + PAGE_SIZE);
  }, [filtered, page]);

  function startEditing(r: Row) {
    setEditingId(r.id);
    setEditingValue(r.paidValue.toFixed(2));
  }

  function cancelEditing() {
    setEditingId(null);
    setEditingValue("");
  }

  async function saveEditing(id: string) {
    if (editingSaving) return;
    const raw = editingValue.replace(",", ".");
    const numeric = Number(raw);
    if (Number.isNaN(numeric) || numeric <= 0) {
      cancelEditing();
      return;
    }
    const current = data.find((r) => r.id === id);
    if (current && numeric.toFixed(2) === current.paidValue.toFixed(2)) {
      cancelEditing();
      return;
    }

    setEditingSaving(true);
    const value = Number(numeric.toFixed(2));
    const oldValue = current?.paidValue ?? 0;

    setData((prev) => prev.map((r) => (r.id === id ? { ...r, paidValue: value } : r)));
    setSelected((prev) => (prev && prev.id === id ? { ...prev, paidValue: value } : prev));

    const res = await fetch(`/api/inspections/${id}`, {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ paidValue: value }),
    }).catch(() => null);

    if (!res || !res.ok) {
      setData((prev) => prev.map((r) => (r.id === id ? { ...r, paidValue: oldValue } : r)));
      setSelected((prev) => (prev && prev.id === id ? { ...prev, paidValue: oldValue } : prev));
      const response = await res?.json().catch(() => null);
      alert(response?.message ?? "Erro ao atualizar valor.");
    }

    setEditingSaving(false);
    setEditingId(null);
    setEditingValue("");
  }

  function updateForm(field: keyof typeof form, value: string) {
    setForm((prev) => ({ ...prev, [field]: value }));
  }

  function normalizeForm() {
    return {
      ...form,
      plate: form.plate.toUpperCase().replace(/[^A-Z0-9]/g, ""),
      customerDoc: form.customerDoc.replace(/\D/g, ""),
      cep: form.cep.replace(/\D/g, ""),
      customerName: form.customerName.trim().toUpperCase(),
      vehicleBrand: form.vehicleBrand.trim().toUpperCase(),
      vehicleModel: form.vehicleModel.trim().toUpperCase(),
      street: form.street.trim().toUpperCase(),
      number: form.number.trim().toUpperCase(),
      district: form.district.trim().toUpperCase(),
      city: form.city.trim().toUpperCase(),
      paidValue: Number(form.paidValue.replace(",", ".")),
      noteValue: Number(form.noteValue.replace(",", ".")),
      nfseNumber: form.nfseNumber.trim() || null,
      errorMessage: form.errorMessage.trim() || null,
    };
  }

  async function saveDetails() {
    if (!selected || formSaving) return;
    const f = normalizeForm();
    if (
      !f.plate ||
      !f.vehicleBrand ||
      !f.vehicleModel ||
      !f.customerName ||
      !f.customerDoc ||
      f.customerDoc.length < 11 ||
      !f.cep ||
      f.cep.length !== 8 ||
      !f.street ||
      !f.number ||
      !f.district ||
      !f.city ||
      Number.isNaN(f.paidValue) ||
      f.paidValue <= 0 ||
      Number.isNaN(f.noteValue) ||
      f.noteValue <= 0
    ) {
      alert("Preencha todos os campos corretamente.");
      return;
    }

    setFormSaving(true);
    const payload = {
      date: f.date,
      status: f.status,
      paidValue: f.paidValue,
      noteValue: f.noteValue,
      plate: f.plate,
      vehicleBrand: f.vehicleBrand,
      vehicleModel: f.vehicleModel,
      customerDoc: f.customerDoc,
      customerName: f.customerName,
      cep: f.cep,
      street: f.street,
      number: f.number,
      district: f.district,
      city: f.city,
      nfseNumber: f.nfseNumber,
      errorMessage: f.errorMessage,
    };

    const res = await fetch(`/api/inspections/${selected.id}`, {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(payload),
    }).catch(() => null);

    const response = await res?.json().catch(() => null);
    if (!res || !res.ok) {
      setFormSaving(false);
      alert(response?.message ?? "Erro ao salvar alterações.");
      return;
    }

    const inspection = response?.inspection;
    if (inspection) {
      const updated: Row = {
        id: inspection.id,
        date: inspection.date,
        plate: inspection.vehicle?.plate ?? "",
        vehicleBrand: inspection.vehicle?.brand ?? "",
        vehicleModel: inspection.vehicle?.model ?? "",
        customerName: inspection.customer?.name ?? "",
        customerDoc: inspection.customer?.doc ?? "",
        paidValue: Number(inspection.paidValue ?? 0),
        noteValue: Number(inspection.noteValue ?? 0),
        cep: inspection.customer?.cep ?? "",
        street: inspection.customer?.street ?? "",
        number: inspection.customer?.number ?? "",
        district: inspection.customer?.district ?? "",
        city: inspection.customer?.city ?? "",
        status: inspection.status,
        nfseNumber: inspection.nfseNumber ?? null,
        errorMessage: inspection.errorMessage ?? null,
      };
      setData((prev) => prev.map((r) => (r.id === updated.id ? updated : r)));
      setSelected(updated);
    }

    setFormSaving(false);
  }

  async function handleDelete(id: string) {
    if (!confirm("Tem certeza que deseja excluir esta vistoria?")) return;
    setDeletingId(id);

    const res = await fetch(`/api/inspections/${id}`, {
      method: "DELETE",
    }).catch(() => null);

    const response = await res?.json().catch(() => null);
    if (!res || !res.ok) {
      setDeletingId(null);
      alert(response?.message ?? "Erro ao excluir vistoria.");
      return;
    }

    setData((prev) => prev.filter((r) => r.id !== id));
    setDeletingId(null);
  }

  function exportCSV() {
    const header = ["Data", "Placa", "Marca", "Modelo", "Cliente", "CPF/CNPJ", "Valor", "Status", "Nº Nota / Erro", "CEP", "Rua", "Nº", "Bairro", "Cidade"].join(";");
    const lines = filtered.map((r) =>
      [
        escapeCSV(toBRDate(r.date)),
        escapeCSV(r.plate),
        escapeCSV(r.vehicleBrand),
        escapeCSV(r.vehicleModel),
        escapeCSV(r.customerName),
        escapeCSV(formatDoc(r.customerDoc)),
        escapeCSV(toBRL(r.paidValue)),
        escapeCSV(r.status === "LANCADO" ? "LANÇADO" : r.status),
        escapeCSV(r.status === "ERRO" ? r.errorMessage ?? "Erro" : r.nfseNumber ?? ""),
        escapeCSV(r.cep),
        escapeCSV(r.street),
        escapeCSV(r.number),
        escapeCSV(r.district),
        escapeCSV(r.city),
      ].join(";")
    );
    const csv = [header, ...lines].join("\n");
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `notas-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }

  const cards = [
    { label: "Total", value: data.length, color: "#1e293b", bg: "#ffffff" },
    { label: "Aguardando", value: totalAguardando, color: "#64748b", bg: "#ffffff" },
    { label: "Lançada", value: totalLancada, color: "#10b981", bg: "#ecfdf5" },
    { label: "Erro", value: totalErro, color: "#ef4444", bg: "#fef2f2" },
  ];

  const statusBadge = (s: Row["status"]) => {
    const isSuccess = s === "EMITIDA" || s === "LANCADO";
    const isError = s === "ERRO";
    const cls = isSuccess ? "bg-success-subtle text-success border border-success-subtle" : isError ? "bg-danger-subtle text-danger border border-danger-subtle" : "bg-secondary-subtle text-secondary border border-secondary-subtle";
    return (
      <span className={`badge ${cls}`} style={{ fontWeight: 500, fontSize: 11, padding: "0.35em 0.65em" }}>
        {s === "LANCADO" ? "LANÇADO" : s}
      </span>
    );
  };

  return (
    <div className="d-flex flex-column gap-3">
      <div className="row g-2">
        {cards.map((c) => (
          <div className="col-6 col-md-3" key={c.label}>
            <div className="card h-100" style={{ borderRadius: 14, background: c.bg, borderLeft: `4px solid ${c.color}` }}>
              <div className="card-body py-3 px-3">
                <div style={{ fontSize: 12, fontWeight: 600, color: "var(--muted)", textTransform: "uppercase", letterSpacing: 0.5 }}>{c.label}</div>
                <div className="fw-bold mt-1" style={{ fontSize: 24, color: c.color }}>{c.value}</div>
              </div>
            </div>
          </div>
        ))}
      </div>

      <div className="card" style={{ borderRadius: 14 }}>
        <div className="card-body py-4 px-4">
          <div className="d-flex flex-column flex-lg-row justify-content-between align-items-lg-center gap-2 mb-4">
            <div>
              <h2 className="h5 fw-bold mb-0" style={{ color: "var(--foreground)" }}>Relação de Notas</h2>
              <div className="text-muted" style={{ fontSize: 13 }}>Acompanhe o status de cada vistoria</div>
            </div>
            <button className="btn btn-outline-primary btn-sm" onClick={exportCSV} disabled={filtered.length === 0}>
              <i className="bi bi-download me-1"></i> Exportar CSV
            </button>
          </div>

          <div className="row g-2 align-items-end mb-3">
            <div className="col-lg-5">
              <label className="form-label text-muted mb-1" style={{ fontSize: 12 }}>Buscar</label>
              <input
                className="form-control form-control-sm"
                value={query}
                onChange={(e) => { setQuery(e.target.value); setPage(1); }}
                placeholder="Placa, cliente, CPF/CNPJ, nº nota..."
              />
            </div>
            <div className="col-lg-7">
              <label className="form-label text-muted mb-1" style={{ fontSize: 12 }}>Status</label>
              <div className="d-flex flex-wrap gap-1">
                {STATUS_OPTIONS.map((opt) => {
                  const active = status === opt.value;
                  return (
                    <button
                      key={opt.value}
                      type="button"
                      className={`btn btn-sm ${active ? "btn-primary" : `btn-${opt.variant}`}`}
                      onClick={() => { setStatus(opt.value as Row["status"] | ""); setPage(1); }}
                    >
                      {opt.label}
                    </button>
                  );
                })}
              </div>
            </div>
          </div>

          {paged.length === 0 ? (
            <div className="text-center text-muted p-4">
              Nenhum registro encontrado.
            </div>
          ) : (
            <div className="d-flex flex-column gap-2">
              {paged.map((r) => {
                const isError = r.status === "ERRO";
                return (
                  <div key={r.id} className="card" style={{ borderRadius: 12, borderLeft: `4px solid ${isError ? "var(--danger)" : r.nfseNumber ? "var(--success)" : "var(--muted)"}` }}>
                    <div className="card-body p-3">
                      <div className="d-flex flex-column flex-lg-row justify-content-between gap-2">
                        <div className="d-flex gap-3">
                          <div className="d-none d-sm-flex align-items-center justify-content-center flex-shrink-0" style={{ width: 52, height: 52, borderRadius: 12, background: "#f1f5f9" }}>
                            <i className="bi bi-car-front" style={{ fontSize: 22, color: "var(--primary)" }} />
                          </div>
                          <div>
                            <div className="d-flex align-items-center gap-2">
                              <span className="fw-bold" style={{ fontSize: 16, color: "var(--foreground)" }}>{r.plate || "-"}</span>
                              <span className="text-muted" style={{ fontSize: 13 }}>{r.vehicleBrand} {r.vehicleModel}</span>
                            </div>
                            <div style={{ fontSize: 14 }}>{r.customerName}</div>
                            <div className="text-muted" style={{ fontSize: 12 }}>{formatDoc(r.customerDoc)} · {toBRDate(r.date)}</div>
                          </div>
                        </div>
                        <div className="d-flex align-items-center flex-wrap gap-3">
                          <div className="text-end">
                            {editingId === r.id ? (
                              <input
                                autoFocus
                                type="number"
                                step="0.01"
                                min="0.01"
                                className="form-control form-control-sm"
                                style={{ width: 110, textAlign: "right" }}
                                value={editingValue}
                                disabled={editingSaving}
                                onChange={(e) => setEditingValue(e.target.value)}
                                onBlur={() => saveEditing(r.id)}
                                onKeyDown={(e) => {
                                  if (e.key === "Enter") {
                                    e.preventDefault();
                                    saveEditing(r.id);
                                  } else if (e.key === "Escape") {
                                    e.preventDefault();
                                    cancelEditing();
                                  }
                                }}
                              />
                            ) : (
                              <div
                                className="fw-bold"
                                style={{ cursor: "pointer", color: "var(--foreground)" }}
                                onClick={() => startEditing(r)}
                                title="Clique para editar"
                              >
                                {toBRL(r.paidValue)}
                              </div>
                            )}
                            <div className="text-muted" style={{ fontSize: 11 }}>Valor pago</div>
                          </div>
                          <div className="text-end" style={{ minWidth: 80 }}>
                            {statusBadge(r.status)}
                            <div className="mt-1" style={{ fontSize: 12, color: isError ? "var(--danger)" : "var(--primary)" }}>
                              {isError ? (r.errorMessage ? `${r.errorMessage.slice(0, 18)}...` : "Erro") : (r.nfseNumber ?? "Aguardando")}
                            </div>
                          </div>
                          <div className="d-flex gap-1">
                            <button className="btn btn-sm btn-light" onClick={() => setSelected(r)} title="Editar detalhes">
                              <i className="bi bi-pencil-square" style={{ fontSize: 14 }} />
                            </button>
                            <button
                              className="btn btn-sm btn-light text-danger"
                              onClick={() => handleDelete(r.id)}
                              disabled={deletingId === r.id || r.status === "EMITIDA" || r.status === "LANCADO"}
                              title="Excluir vistoria"
                            >
                              <i className="bi bi-trash" style={{ fontSize: 14 }} />
                            </button>
                          </div>
                        </div>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}

          {filtered.length > PAGE_SIZE ? (
            <div className="d-flex justify-content-between align-items-center mt-2">
              <div className="text-muted" style={{ fontSize: 12 }}>
                {(page - 1) * PAGE_SIZE + 1}–{Math.min(page * PAGE_SIZE, filtered.length)} de {filtered.length}
              </div>
              <div className="btn-group btn-group-sm">
                <button className="btn btn-outline-secondary" onClick={() => setPage((p) => Math.max(1, p - 1))} disabled={page === 1}>
                  ‹
                </button>
                <span className="btn btn-outline-secondary disabled">
                  {page} / {totalPages}
                </span>
                <button
                  className="btn btn-outline-secondary"
                  onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                  disabled={page === totalPages}
                >
                  ›
                </button>
              </div>
            </div>
          ) : (
            <div className="text-muted mt-2" style={{ fontSize: 12 }}>Total: {filtered.length}</div>
          )}
        </div>
      </div>

      {selected ? (
        <div className="modal show d-block" tabIndex={-1} style={{ background: "rgba(0,0,0,0.5)" }}>
          <div className="modal-dialog modal-dialog-centered modal-lg">
            <div className="modal-content border-0" style={{ borderRadius: 16 }}>
              <div className="modal-header border-0">
                <h5 className="modal-title fw-bold" style={{ color: "#2c3e50" }}>Editar Vistoria</h5>
                <button type="button" className="btn-close" onClick={() => setSelected(null)} />
              </div>
              <div className="modal-body">
                <div className="row g-3">
                  <div className="col-md-3">
                    <label className="form-label text-muted mb-1" style={{ fontSize: 12 }}>Placa</label>
                    <input
                      className="form-control form-control-sm"
                      value={form.plate}
                      onChange={(e) => updateForm("plate", e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, ""))}
                      maxLength={7}
                    />
                  </div>
                  <div className="col-md-3">
                    <label className="form-label text-muted mb-1" style={{ fontSize: 12 }}>Data</label>
                    <input
                      type="date"
                      className="form-control form-control-sm"
                      value={form.date}
                      onChange={(e) => updateForm("date", e.target.value)}
                    />
                  </div>
                  <div className="col-md-3">
                    <label className="form-label text-muted mb-1" style={{ fontSize: 12 }}>Marca</label>
                    <input
                      className="form-control form-control-sm"
                      value={form.vehicleBrand}
                      onChange={(e) => updateForm("vehicleBrand", e.target.value.toUpperCase())}
                    />
                  </div>
                  <div className="col-md-3">
                    <label className="form-label text-muted mb-1" style={{ fontSize: 12 }}>Modelo</label>
                    <input
                      className="form-control form-control-sm"
                      value={form.vehicleModel}
                      onChange={(e) => updateForm("vehicleModel", e.target.value.toUpperCase())}
                    />
                  </div>
                  <div className="col-md-6">
                    <label className="form-label text-muted mb-1" style={{ fontSize: 12 }}>Cliente</label>
                    <input
                      className="form-control form-control-sm"
                      value={form.customerName}
                      onChange={(e) => updateForm("customerName", e.target.value.toUpperCase())}
                    />
                  </div>
                  <div className="col-md-6">
                    <label className="form-label text-muted mb-1" style={{ fontSize: 12 }}>CPF/CNPJ</label>
                    <input
                      className="form-control form-control-sm"
                      value={form.customerDoc}
                      onChange={(e) => updateForm("customerDoc", formatDoc(e.target.value))}
                      maxLength={18}
                    />
                  </div>
                  <div className="col-md-6">
                    <label className="form-label text-muted mb-1" style={{ fontSize: 12 }}>Rua</label>
                    <input
                      className="form-control form-control-sm"
                      value={form.street}
                      onChange={(e) => updateForm("street", e.target.value.toUpperCase())}
                    />
                  </div>
                  <div className="col-md-2">
                    <label className="form-label text-muted mb-1" style={{ fontSize: 12 }}>Nº</label>
                    <input
                      className="form-control form-control-sm"
                      value={form.number}
                      onChange={(e) => updateForm("number", e.target.value.toUpperCase())}
                    />
                  </div>
                  <div className="col-md-4">
                    <label className="form-label text-muted mb-1" style={{ fontSize: 12 }}>Bairro</label>
                    <input
                      className="form-control form-control-sm"
                      value={form.district}
                      onChange={(e) => updateForm("district", e.target.value.toUpperCase())}
                    />
                  </div>
                  <div className="col-md-6">
                    <label className="form-label text-muted mb-1" style={{ fontSize: 12 }}>Cidade</label>
                    <input
                      className="form-control form-control-sm"
                      value={form.city}
                      onChange={(e) => updateForm("city", e.target.value.toUpperCase())}
                    />
                  </div>
                  <div className="col-md-6">
                    <label className="form-label text-muted mb-1" style={{ fontSize: 12 }}>CEP</label>
                    <input
                      className="form-control form-control-sm"
                      value={form.cep}
                      onChange={(e) => updateForm("cep", e.target.value.replace(/\D/g, "").slice(0, 8))}
                      maxLength={8}
                    />
                  </div>
                  <div className="col-md-6">
                    <label className="form-label text-muted mb-1" style={{ fontSize: 12 }}>Valor Pago</label>
                    <input
                      type="number"
                      step="0.01"
                      min="0.01"
                      className="form-control form-control-sm"
                      value={form.paidValue}
                      onChange={(e) => updateForm("paidValue", e.target.value)}
                    />
                  </div>
                  <div className="col-md-6">
                    <label className="form-label text-muted mb-1" style={{ fontSize: 12 }}>Valor Nota</label>
                    <input
                      type="number"
                      step="0.01"
                      min="0.01"
                      className="form-control form-control-sm"
                      value={form.noteValue}
                      onChange={(e) => updateForm("noteValue", e.target.value)}
                    />
                  </div>
                  <div className="col-md-6">
                    <label className="form-label text-muted mb-1" style={{ fontSize: 12 }}>Status</label>
                    <select
                      className="form-select form-select-sm"
                      value={form.status}
                      onChange={(e) => updateForm("status", e.target.value as Row["status"])}
                    >
                      <option value="AGUARDANDO">Aguardando</option>
                      <option value="EMITIDA">Emitida</option>
                      <option value="LANCADO">Lançada</option>
                      <option value="ERRO">Erro</option>
                    </select>
                    {form.status === "ERRO" ? (
                      <div className="form-text text-muted" style={{ fontSize: 11 }}>
                        Para tentar emitir a nota novamente, altere o status para "Aguardando".
                      </div>
                    ) : null}
                  </div>
                  <div className="col-md-6">
                    {form.status === "ERRO" ? (
                      <>
                        <label className="form-label text-muted mb-1" style={{ fontSize: 12 }}>Mensagem de Erro</label>
                        <input
                          className="form-control form-control-sm"
                          value={form.errorMessage}
                          onChange={(e) => updateForm("errorMessage", e.target.value)}
                        />
                      </>
                    ) : (
                      <>
                        <label className="form-label text-muted mb-1" style={{ fontSize: 12 }}>Nº Nota</label>
                        <input
                          className="form-control form-control-sm"
                          value={form.nfseNumber}
                          onChange={(e) => updateForm("nfseNumber", e.target.value)}
                        />
                      </>
                    )}
                  </div>
                </div>
              </div>
              <div className="modal-footer border-0">
                <button className="btn btn-secondary" onClick={() => setSelected(null)} disabled={formSaving}>
                  Cancelar
                </button>
                <button className="btn btn-primary" onClick={saveDetails} disabled={formSaving}>
                  {formSaving ? "Salvando..." : "Salvar"}
                </button>
              </div>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
