"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import CustomersClient from "../clientes/CustomersClient";
import UsuariosClient from "../usuarios/UsuariosClient";

type Tab = "painel" | "usuarios" | "clientes" | "veiculos" | "ruas";

type Counts = { customers: number; vehicles: number; streets: number; users: number };

type VehicleRow = { id: string; plate: string; brand: string; model: string; updatedAt: string };
type StreetRow = { id: string; street: string; district: string; city: string; cep: string; updatedAt: string };

function formatCep(v: string) {
  const d = String(v || "").replace(/\D/g, "").slice(0, 8);
  if (d.length <= 5) return d;
  return `${d.slice(0, 5)}-${d.slice(5)}`;
}

function normalizePlate(v: string) {
  return String(v || "")
    .replace(/\s/g, "")
    .toUpperCase()
    .replace(/[^A-Z0-9]/g, "");
}

export default function AdministracaoClient({ counts }: { counts: Counts }) {
  const [tab, setTab] = useState<Tab>("painel");

  return (
    <div>
      <div className="mb-4">
        <h1 className="h3 fw-bold mb-1" style={{ color: "#2c3e50" }}>
          Administração
        </h1>
        <div className="text-muted">Usuários, clientes, veículos e cadastro de ruas/CEP em um só lugar.</div>
      </div>

      <ul className="nav nav-tabs flex-nowrap overflow-auto gap-1 mb-4" style={{ borderBottom: "2px solid #dee2e6" }}>
        {(
          [
            ["painel", "Painel", "bi-speedometer2"],
            ["usuarios", "Usuários", "bi-person-gear"],
            ["clientes", "Clientes", "bi-people"],
            ["veiculos", "Veículos", "bi-truck-front"],
            ["ruas", "Ruas e CEP", "bi-signpost"],
          ] as const
        ).map(([k, label, icon]) => (
          <li className="nav-item" key={k}>
            <button
              type="button"
              className={`nav-link d-flex align-items-center gap-2 ${tab === k ? "active fw-semibold" : "text-secondary"}`}
              onClick={() => setTab(k)}
              style={{ border: "none", background: "transparent", whiteSpace: "nowrap" }}
            >
              <i className={`bi ${icon}`} />
              {label}
            </button>
          </li>
        ))}
      </ul>

      {tab === "painel" ? <PainelTab counts={counts} onGo={(t) => setTab(t)} /> : null}
      {tab === "usuarios" ? <UsuariosClient /> : null}
      {tab === "clientes" ? <CustomersClient /> : null}
      {tab === "veiculos" ? <VeiculosTab /> : null}
      {tab === "ruas" ? <RuasTab /> : null}
    </div>
  );
}

function PainelTab({ counts, onGo }: { counts: Counts; onGo: (t: Tab) => void }) {
  return (
    <div className="row g-3">
      <div className="col-sm-6 col-xl-3">
        <button type="button" className="card border-0 shadow-sm w-100 text-start h-100" style={{ borderRadius: 14 }} onClick={() => onGo("usuarios")}>
          <div className="card-body">
            <div className="text-muted small">Usuários</div>
            <div className="display-6 fw-bold" style={{ color: "#e63946" }}>
              {counts.users}
            </div>
            <div className="small text-primary mt-2">Gerenciar acessos →</div>
          </div>
        </button>
      </div>
      <div className="col-sm-6 col-xl-3">
        <button type="button" className="card border-0 shadow-sm w-100 text-start h-100" style={{ borderRadius: 14 }} onClick={() => onGo("clientes")}>
          <div className="card-body">
            <div className="text-muted small">Clientes</div>
            <div className="display-6 fw-bold" style={{ color: "#2c3e50" }}>
              {counts.customers}
            </div>
            <div className="small text-primary mt-2">Abrir cadastro →</div>
          </div>
        </button>
      </div>
      <div className="col-sm-6 col-xl-3">
        <button type="button" className="card border-0 shadow-sm w-100 text-start h-100" style={{ borderRadius: 14 }} onClick={() => onGo("veiculos")}>
          <div className="card-body">
            <div className="text-muted small">Veículos</div>
            <div className="display-6 fw-bold" style={{ color: "#2c3e50" }}>
              {counts.vehicles}
            </div>
            <div className="small text-primary mt-2">Ver veículos →</div>
          </div>
        </button>
      </div>
      <div className="col-sm-6 col-xl-3">
        <button type="button" className="card border-0 shadow-sm w-100 text-start h-100" style={{ borderRadius: 14 }} onClick={() => onGo("ruas")}>
          <div className="card-body">
            <div className="text-muted small">Ruas (CEP)</div>
            <div className="display-6 fw-bold" style={{ color: "#2c3e50" }}>
              {counts.streets}
            </div>
            <div className="small text-primary mt-2">Abrir ruas →</div>
          </div>
        </button>
      </div>

      <div className="col-12">
        <div className="card border-0 shadow-sm" style={{ borderRadius: 14 }}>
          <div className="card-body d-flex flex-wrap gap-2 align-items-center">
            <span className="text-muted small me-2">Atalhos:</span>
            <Link href="/automacao" className="btn btn-outline-secondary btn-sm rounded-pill">
              <i className="bi bi-robot me-1" />
              Automação
            </Link>
            <Link href="/vistorias/nova" className="btn btn-outline-danger btn-sm rounded-pill">
              <i className="bi bi-file-earmark-plus me-1" />
              Nova vistoria
            </Link>
            <Link href="/financeiro" className="btn btn-outline-secondary btn-sm rounded-pill">
              <i className="bi bi-graph-up-arrow me-1" />
              Financeiro
            </Link>
          </div>
        </div>
      </div>
    </div>
  );
}

function VeiculosTab() {
  const [query, setQuery] = useState("");
  const [items, setItems] = useState<VehicleRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [plate, setPlate] = useState("");
  const [brand, setBrand] = useState("");
  const [model, setModel] = useState("");
  const [edit, setEdit] = useState<VehicleRow | null>(null);
  const [saving, setSaving] = useState(false);

  async function load() {
    setLoading(true);
    setError(null);
    const res = await fetch(`/api/admin/vehicles${query.trim() ? `?query=${encodeURIComponent(query.trim())}` : ""}`).catch(() => null);
    if (!res || !res.ok) {
      setLoading(false);
      setError(res?.status === 403 ? "Apenas administrador." : "Não foi possível carregar veículos.");
      return;
    }
    const data = (await res.json()) as { ok?: boolean; vehicles?: VehicleRow[] };
    setItems(data.vehicles ?? []);
    setLoading(false);
  }

  useEffect(() => {
    void load();
  }, []);

  const rows = useMemo(() => items, [items]);

  async function onSaveNew() {
    setSaving(true);
    setError(null);
    const res = await fetch("/api/admin/vehicles", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ plate: normalizePlate(plate), brand, model }),
    }).catch(() => null);
    setSaving(false);
    if (!res || !res.ok) {
      setError("Não foi possível salvar. Verifique a placa (7 a 10 letras/números).");
      return;
    }
    setPlate("");
    setBrand("");
    setModel("");
    await load();
  }

  async function onSaveEdit() {
    if (!edit) return;
    setSaving(true);
    setError(null);
    const res = await fetch(`/api/admin/vehicles/${edit.id}`, {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ brand, model }),
    }).catch(() => null);
    setSaving(false);
    if (!res || !res.ok) {
      setError("Não foi possível atualizar.");
      return;
    }
    setEdit(null);
    setBrand("");
    setModel("");
    await load();
  }

  function openEdit(v: VehicleRow) {
    setEdit(v);
    setBrand(v.brand);
    setModel(v.model);
  }

  return (
    <div className="row g-4">
      <div className="col-lg-4">
        <div className="card border-0 shadow-sm" style={{ borderRadius: 14 }}>
          <div className="card-body">
            <div className="fw-bold mb-2" style={{ color: "#2c3e50" }}>
              {edit ? "Editar veículo" : "Novo veículo"}
            </div>
            {error ? <div className="alert alert-danger py-2 small">{error}</div> : null}
            {edit ? (
              <>
                <div className="mb-2 text-muted small">Placa: {edit.plate}</div>
                <div className="mb-3">
                  <label className="form-label">Marca</label>
                  <input className="form-control text-uppercase" value={brand} onChange={(e) => setBrand(e.target.value.toUpperCase())} />
                </div>
                <div className="mb-3">
                  <label className="form-label">Modelo</label>
                  <input className="form-control text-uppercase" value={model} onChange={(e) => setModel(e.target.value.toUpperCase())} />
                </div>
                <div className="d-flex gap-2">
                  <button className="btn btn-danger flex-grow-1" type="button" disabled={saving} onClick={onSaveEdit}>
                    Salvar
                  </button>
                  <button
                    className="btn btn-outline-secondary"
                    type="button"
                    onClick={() => {
                      setEdit(null);
                      setBrand("");
                      setModel("");
                      setError(null);
                    }}
                  >
                    Cancelar
                  </button>
                </div>
              </>
            ) : (
              <>
                <div className="mb-3">
                  <label className="form-label">Placa</label>
                  <input
                    className="form-control text-uppercase"
                    value={plate}
                    onChange={(e) => setPlate(e.target.value.toUpperCase())}
                    placeholder="ABC1D23"
                  />
                </div>
                <div className="mb-3">
                  <label className="form-label">Marca</label>
                  <input className="form-control text-uppercase" value={brand} onChange={(e) => setBrand(e.target.value.toUpperCase())} />
                </div>
                <div className="mb-3">
                  <label className="form-label">Modelo</label>
                  <input className="form-control text-uppercase" value={model} onChange={(e) => setModel(e.target.value.toUpperCase())} />
                </div>
                <button className="btn btn-danger w-100" type="button" disabled={saving} onClick={onSaveNew}>
                  {saving ? "Salvando..." : "Cadastrar / atualizar por placa"}
                </button>
              </>
            )}
          </div>
        </div>
      </div>
      <div className="col-lg-8">
        <div className="card border-0 shadow-sm" style={{ borderRadius: 14 }}>
          <div className="card-body">
            <div className="d-flex flex-wrap gap-2 justify-content-between align-items-center mb-3">
              <div className="fw-bold" style={{ color: "#2c3e50" }}>
                Lista de veículos
              </div>
              <div className="d-flex gap-2 flex-grow-1" style={{ minWidth: 200, maxWidth: 360 }}>
                <input
                  className="form-control form-control-sm"
                  placeholder="Filtrar placa/marca/modelo"
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  onKeyDown={(e) => e.key === "Enter" && void load()}
                />
                <button className="btn btn-sm btn-outline-secondary" type="button" onClick={() => void load()} disabled={loading}>
                  <i className="bi bi-search" />
                </button>
              </div>
            </div>
            <div className="table-responsive" style={{ maxHeight: "65vh" }}>
              <table className="table table-hover align-middle mb-0">
                <thead className="table-light sticky-top">
                  <tr>
                    <th>Placa</th>
                    <th>Marca</th>
                    <th>Modelo</th>
                    <th />
                  </tr>
                </thead>
                <tbody>
                  {loading ? (
                    <tr>
                      <td colSpan={4} className="text-muted text-center p-4">
                        Carregando...
                      </td>
                    </tr>
                  ) : rows.length === 0 ? (
                    <tr>
                      <td colSpan={4} className="text-muted text-center p-4">
                        Nenhum veículo.
                      </td>
                    </tr>
                  ) : (
                    rows.map((v) => (
                      <tr key={v.id}>
                        <td className="fw-semibold">{v.plate}</td>
                        <td>{v.brand}</td>
                        <td>{v.model}</td>
                        <td className="text-end">
                          <button className="btn btn-sm btn-outline-primary" type="button" onClick={() => openEdit(v)}>
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
        </div>
      </div>
    </div>
  );
}

function RuasTab() {
  const [query, setQuery] = useState("");
  const [items, setItems] = useState<StreetRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [street, setStreet] = useState("");
  const [district, setDistrict] = useState("");
  const [city, setCity] = useState("");
  const [cep, setCep] = useState("");
  const [edit, setEdit] = useState<StreetRow | null>(null);
  const [saving, setSaving] = useState(false);

  async function load() {
    setLoading(true);
    setError(null);
    const res = await fetch(`/api/admin/streets${query.trim() ? `?query=${encodeURIComponent(query.trim())}` : ""}`).catch(() => null);
    if (!res || !res.ok) {
      setLoading(false);
      setError(res?.status === 403 ? "Apenas administrador." : "Não foi possível carregar ruas.");
      return;
    }
    const data = (await res.json()) as { ok?: boolean; streets?: StreetRow[] };
    setItems(data.streets ?? []);
    setLoading(false);
  }

  useEffect(() => {
    void load();
  }, []);

  function digitsCep(v: string) {
    return String(v || "").replace(/\D/g, "").slice(0, 8);
  }

  async function onSaveNew() {
    setSaving(true);
    setError(null);
    const res = await fetch("/api/admin/streets", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        street,
        district,
        city,
        cep: digitsCep(cep),
      }),
    }).catch(() => null);
    setSaving(false);
    if (!res || !res.ok) {
      const d = await res?.json().catch(() => null);
      setError((d as { message?: string })?.message ?? "Não foi possível salvar.");
      return;
    }
    setStreet("");
    setDistrict("");
    setCity("");
    setCep("");
    await load();
  }

  async function onSaveEdit() {
    if (!edit) return;
    setSaving(true);
    setError(null);
    const res = await fetch(`/api/admin/streets/${edit.id}`, {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        street,
        district,
        city,
        cep: digitsCep(cep),
      }),
    }).catch(() => null);
    setSaving(false);
    if (!res || !res.ok) {
      const d = await res?.json().catch(() => null);
      setError((d as { message?: string })?.message ?? "Não foi possível atualizar.");
      return;
    }
    setEdit(null);
    resetForm();
    await load();
  }

  function resetForm() {
    setStreet("");
    setDistrict("");
    setCity("");
    setCep("");
  }

  function openEdit(s: StreetRow) {
    setEdit(s);
    setStreet(s.street);
    setDistrict(s.district);
    setCity(s.city);
    setCep(formatCep(s.cep));
  }

  return (
    <div className="row g-4">
      <div className="col-lg-4">
        <div className="card border-0 shadow-sm" style={{ borderRadius: 14 }}>
          <div className="card-body">
            <div className="fw-bold mb-2" style={{ color: "#2c3e50" }}>
              {edit ? "Editar rua" : "Nova rua (CEP)"}
            </div>
            <p className="text-muted small">Usado na busca de endereço na nova vistoria. Combinação rua+bairro+cidade+CEP deve ser única.</p>
            {error ? <div className="alert alert-danger py-2 small">{error}</div> : null}
            <div className="mb-2">
              <label className="form-label">CEP</label>
              <input className="form-control" value={cep} onChange={(e) => setCep(formatCep(e.target.value))} placeholder="00000-000" />
            </div>
            <div className="mb-2">
              <label className="form-label">Rua</label>
              <input className="form-control text-uppercase" value={street} onChange={(e) => setStreet(e.target.value.toUpperCase())} />
            </div>
            <div className="mb-2">
              <label className="form-label">Bairro</label>
              <input className="form-control text-uppercase" value={district} onChange={(e) => setDistrict(e.target.value.toUpperCase())} />
            </div>
            <div className="mb-3">
              <label className="form-label">Cidade</label>
              <input className="form-control text-uppercase" value={city} onChange={(e) => setCity(e.target.value.toUpperCase())} />
            </div>
            {edit ? (
              <div className="d-flex gap-2">
                <button className="btn btn-danger flex-grow-1" type="button" disabled={saving} onClick={onSaveEdit}>
                  Salvar
                </button>
                <button
                  className="btn btn-outline-secondary"
                  type="button"
                  onClick={() => {
                    setEdit(null);
                    resetForm();
                    setError(null);
                  }}
                >
                  Cancelar
                </button>
              </div>
            ) : (
              <button className="btn btn-danger w-100" type="button" disabled={saving} onClick={onSaveNew}>
                {saving ? "Salvando..." : "Cadastrar / atualizar"}
              </button>
            )}
          </div>
        </div>
      </div>
      <div className="col-lg-8">
        <div className="card border-0 shadow-sm" style={{ borderRadius: 14 }}>
          <div className="card-body">
            <div className="d-flex flex-wrap gap-2 justify-content-between align-items-center mb-3">
              <div className="fw-bold" style={{ color: "#2c3e50" }}>
                Ruas cadastradas
              </div>
              <div className="d-flex gap-2 flex-grow-1" style={{ minWidth: 200, maxWidth: 400 }}>
                <input
                  className="form-control form-control-sm"
                  placeholder="Buscar rua, bairro, cidade ou CEP"
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  onKeyDown={(e) => e.key === "Enter" && void load()}
                />
                <button className="btn btn-sm btn-outline-secondary" type="button" onClick={() => void load()} disabled={loading}>
                  <i className="bi bi-search" />
                </button>
              </div>
            </div>
            <div className="table-responsive" style={{ maxHeight: "65vh" }}>
              <table className="table table-hover align-middle mb-0 small">
                <thead className="table-light sticky-top">
                  <tr>
                    <th>CEP</th>
                    <th>Rua</th>
                    <th>Bairro</th>
                    <th>Cidade</th>
                    <th />
                  </tr>
                </thead>
                <tbody>
                  {loading ? (
                    <tr>
                      <td colSpan={5} className="text-muted text-center p-4">
                        Carregando...
                      </td>
                    </tr>
                  ) : items.length === 0 ? (
                    <tr>
                      <td colSpan={5} className="text-muted text-center p-4">
                        Nenhuma rua encontrada.
                      </td>
                    </tr>
                  ) : (
                    items.map((s) => (
                      <tr key={s.id}>
                        <td>{formatCep(s.cep)}</td>
                        <td className="fw-semibold">{s.street}</td>
                        <td>{s.district}</td>
                        <td>{s.city}</td>
                        <td className="text-end">
                          <button className="btn btn-sm btn-outline-primary" type="button" onClick={() => openEdit(s)}>
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
        </div>
      </div>
    </div>
  );
}
