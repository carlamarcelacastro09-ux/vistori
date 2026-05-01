"use client";

import { useEffect, useMemo, useState } from "react";

type Customer = {
  id: string;
  doc: string;
  name: string;
  street: string;
  number: string;
  district: string;
  city: string;
  cep: string;
  updatedAt: string;
};

function onlyDigits(v: string) {
  return String(v || "").replace(/\D/g, "");
}

function formatCpfCnpj(input: string) {
  const d = onlyDigits(input);
  if (d.length <= 11) {
    const p1 = d.slice(0, 3);
    const p2 = d.slice(3, 6);
    const p3 = d.slice(6, 9);
    const p4 = d.slice(9, 11);
    let out = p1;
    if (p2) out += `.${p2}`;
    if (p3) out += `.${p3}`;
    if (p4) out += `-${p4}`;
    return out;
  }

  const p1 = d.slice(0, 2);
  const p2 = d.slice(2, 5);
  const p3 = d.slice(5, 8);
  const p4 = d.slice(8, 12);
  const p5 = d.slice(12, 14);
  let out = p1;
  if (p2) out += `.${p2}`;
  if (p3) out += `.${p3}`;
  if (p4) out += `/${p4}`;
  if (p5) out += `-${p5}`;
  return out;
}

function formatCep(input: string) {
  const d = onlyDigits(input).slice(0, 8);
  if (d.length <= 5) return d;
  return `${d.slice(0, 5)}-${d.slice(5)}`;
}

export default function CustomersClient() {
  const [query, setQuery] = useState("");
  const [loading, setLoading] = useState(true);
  const [items, setItems] = useState<Customer[]>([]);
  const [error, setError] = useState<string | null>(null);

  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<Customer | null>(null);
  const [saving, setSaving] = useState(false);

  const [doc, setDoc] = useState("");
  const [name, setName] = useState("");
  const [cep, setCep] = useState("");
  const [street, setStreet] = useState("");
  const [number, setNumber] = useState("");
  const [district, setDistrict] = useState("");
  const [city, setCity] = useState("");

  function resetForm() {
    setDoc("");
    setName("");
    setCep("");
    setStreet("");
    setNumber("");
    setDistrict("");
    setCity("");
  }

  function openNew() {
    setEditing(null);
    resetForm();
    setOpen(true);
  }

  function openEdit(c: Customer) {
    setEditing(c);
    setDoc(formatCpfCnpj(c.doc));
    setName(c.name);
    setCep(formatCep(c.cep));
    setStreet(c.street);
    setNumber(c.number);
    setDistrict(c.district);
    setCity(c.city);
    setOpen(true);
  }

  async function load() {
    setLoading(true);
    setError(null);
    const q = query.trim();
    const res = await fetch(`/api/customers${q ? `?query=${encodeURIComponent(q)}` : ""}`).catch(() => null);
    if (!res || !res.ok) {
      setLoading(false);
      setError("Não foi possível carregar os clientes.");
      return;
    }
    const data = (await res.json().catch(() => null)) as { ok?: boolean; customers?: Customer[] } | null;
    setItems(data?.customers ?? []);
    setLoading(false);
  }

  useEffect(() => {
    const t = setTimeout(() => {
      void load();
    }, 0);
    return () => clearTimeout(t);
  }, []);

  const filtered = useMemo(() => {
    const q = query.trim().toUpperCase();
    if (!q) return items;
    const qDigits = onlyDigits(q);
    return items.filter((c) => {
      const byName = c.name.toUpperCase().includes(q);
      const byDoc = qDigits ? onlyDigits(c.doc).includes(qDigits) : false;
      return byName || byDoc;
    });
  }, [items, query]);

  async function onSave() {
    const payload = {
      doc,
      name,
      cep,
      street,
      number,
      district,
      city,
    };

    setSaving(true);
    setError(null);

    const res = await fetch(editing ? `/api/customers/${editing.id}` : "/api/customers", {
      method: editing ? "PATCH" : "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(payload),
    }).catch(() => null);

    setSaving(false);

    if (!res || !res.ok) {
      setError("Não foi possível salvar.");
      return;
    }

    setOpen(false);
    await load();
  }

  return (
    <div className="card shadow-sm border-0" style={{ borderRadius: 14 }}>
      <div className="card-body">
        <div className="d-flex flex-column flex-md-row gap-3 justify-content-between align-items-md-center mb-3">
          <div>
            <div className="fw-bold" style={{ color: "#2c3e50", fontSize: 18 }}>
              Clientes
            </div>
            <div className="text-muted" style={{ fontSize: 13 }}>
              Pesquise, atualize ou cadastre manualmente.
            </div>
          </div>

          <div className="d-flex gap-2">
            <button className="btn btn-outline-secondary" type="button" onClick={load} disabled={loading}>
              <i className="bi bi-arrow-clockwise me-2" />
              Atualizar
            </button>
            <button className="btn btn-danger" type="button" onClick={openNew}>
              <i className="bi bi-person-plus me-2" />
              Novo cliente
            </button>
          </div>
        </div>

        <div className="row g-3 align-items-end mb-3">
          <div className="col-md-6">
            <label className="form-label">Buscar (nome ou CPF/CNPJ)</label>
            <input className="form-control" value={query} onChange={(e) => setQuery(e.target.value)} />
          </div>
          <div className="col-md-6 text-md-end text-muted" style={{ fontSize: 13 }}>
            Total: {filtered.length}
          </div>
        </div>

        {error ? <div className="alert alert-danger py-2">{error}</div> : null}

        <div className="table-responsive" style={{ maxHeight: "70vh" }}>
          <table className="table table-hover align-middle mb-0">
            <thead className="table-light" style={{ position: "sticky", top: 0, zIndex: 1 }}>
              <tr>
                <th style={{ width: 160 }}>CPF/CNPJ</th>
                <th>Cliente</th>
                <th>Endereço</th>
                <th style={{ width: 1 }} />
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr>
                  <td colSpan={4} className="text-center text-muted p-5">
                    Carregando...
                  </td>
                </tr>
              ) : filtered.length === 0 ? (
                <tr>
                  <td colSpan={4} className="text-center text-muted p-5">
                    Nenhum cliente encontrado.
                  </td>
                </tr>
              ) : (
                filtered.map((c) => (
                  <tr key={c.id}>
                    <td className="fw-semibold">{formatCpfCnpj(c.doc)}</td>
                    <td>
                      <div className="fw-semibold">{c.name}</div>
                      <div className="text-muted" style={{ fontSize: 12 }}>
                        Atualizado em {new Date(c.updatedAt).toLocaleDateString("pt-BR")}
                      </div>
                    </td>
                    <td className="text-muted" style={{ fontSize: 13 }}>
                      {c.street ? (
                        <>
                          {c.street}
                          {c.number ? `, ${c.number}` : ""} • {c.district} • {c.city} • CEP {formatCep(c.cep)}
                        </>
                      ) : (
                        "-"
                      )}
                    </td>
                    <td className="text-end">
                      <button className="btn btn-sm btn-outline-primary" type="button" onClick={() => openEdit(c)}>
                        <i className="bi bi-pencil me-2" />
                        Editar
                      </button>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {open ? (
        <>
          <div className="modal-backdrop fade show" />
          <div className="modal fade show" style={{ display: "block" }} role="dialog" aria-modal="true">
            <div className="modal-dialog modal-lg modal-dialog-centered">
              <div className="modal-content border-0" style={{ borderRadius: 16 }}>
                <div className="modal-header">
                  <div className="fw-bold">{editing ? "Editar cliente" : "Novo cliente"}</div>
                  <button type="button" className="btn-close" onClick={() => setOpen(false)} />
                </div>
                <div className="modal-body">
                  <div className="row g-3">
                    <div className="col-md-4">
                      <label className="form-label">CPF/CNPJ</label>
                      <input
                        className="form-control"
                        value={doc}
                        onChange={(e) => setDoc(formatCpfCnpj(e.target.value))}
                        onBlur={() => setDoc((v) => formatCpfCnpj(v))}
                      />
                    </div>
                    <div className="col-md-8">
                      <label className="form-label">Nome</label>
                      <input className="form-control text-uppercase" value={name} onChange={(e) => setName(e.target.value.toUpperCase())} />
                    </div>

                    <div className="col-md-3">
                      <label className="form-label">CEP</label>
                      <input className="form-control" value={cep} onChange={(e) => setCep(formatCep(e.target.value))} />
                    </div>
                    <div className="col-md-7">
                      <label className="form-label">Rua</label>
                      <input className="form-control text-uppercase" value={street} onChange={(e) => setStreet(e.target.value.toUpperCase())} />
                    </div>
                    <div className="col-md-2">
                      <label className="form-label">Nº</label>
                      <input className="form-control text-uppercase" value={number} onChange={(e) => setNumber(e.target.value.toUpperCase())} />
                    </div>
                    <div className="col-md-6">
                      <label className="form-label">Bairro</label>
                      <input className="form-control text-uppercase" value={district} onChange={(e) => setDistrict(e.target.value.toUpperCase())} />
                    </div>
                    <div className="col-md-6">
                      <label className="form-label">Cidade</label>
                      <input className="form-control text-uppercase" value={city} onChange={(e) => setCity(e.target.value.toUpperCase())} />
                    </div>
                  </div>
                </div>
                <div className="modal-footer">
                  <button type="button" className="btn btn-outline-secondary" onClick={() => setOpen(false)} disabled={saving}>
                    Cancelar
                  </button>
                  <button type="button" className="btn btn-danger" onClick={onSave} disabled={saving}>
                    {saving ? "Salvando..." : "Salvar"}
                  </button>
                </div>
              </div>
            </div>
          </div>
        </>
      ) : null}
    </div>
  );
}
