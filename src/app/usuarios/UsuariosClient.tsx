"use client";

import { useEffect, useState } from "react";

type UserRow = {
  id: string;
  email: string;
  name: string;
  role: "ADMIN" | "OPERADOR";
  createdAt: string;
};

export default function UsuariosClient() {
  const [items, setItems] = useState<UserRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [email, setEmail] = useState("");
  const [name, setName] = useState("");
  const [password, setPassword] = useState("");
  const [role, setRole] = useState<"ADMIN" | "OPERADOR">("OPERADOR");

  async function load() {
    setLoading(true);
    setError(null);
    const res = await fetch("/api/admin/users").catch(() => null);
    if (!res || !res.ok) {
      setLoading(false);
      setError("Não foi possível carregar usuários.");
      return;
    }
    const data = (await res.json().catch(() => null)) as { ok?: boolean; users?: UserRow[] } | null;
    setItems(data?.users ?? []);
    setLoading(false);
  }

  useEffect(() => {
    const t = setTimeout(() => {
      void load();
    }, 0);
    return () => clearTimeout(t);
  }, []);

  async function onSave() {
    setSaving(true);
    setError(null);
    const res = await fetch("/api/admin/users", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ email, name, password, role }),
    }).catch(() => null);
    setSaving(false);
    if (!res || !res.ok) {
      setError("Não foi possível salvar usuário.");
      return;
    }
    setEmail("");
    setName("");
    setPassword("");
    setRole("OPERADOR");
    await load();
  }

  return (
    <div className="row g-4">
      <div className="col-lg-5">
        <div className="card shadow-sm border-0" style={{ borderRadius: 14 }}>
          <div className="card-body">
            <div className="fw-bold mb-2" style={{ color: "#2c3e50" }}>
              Criar/Atualizar usuário
            </div>
            <div className="text-muted mb-3" style={{ fontSize: 13 }}>
              Use para cadastrar o acesso do seu esposo (ou de quem for operar).
            </div>

            {error ? <div className="alert alert-danger py-2">{error}</div> : null}

            <div className="mb-3">
              <label className="form-label">E-mail</label>
              <input className="form-control" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="agpissarro@gmail.com" />
            </div>
            <div className="mb-3">
              <label className="form-label">Nome</label>
              <input className="form-control" value={name} onChange={(e) => setName(e.target.value)} placeholder="AG Pissarro" />
            </div>
            <div className="mb-3">
              <label className="form-label">Senha</label>
              <input className="form-control" value={password} onChange={(e) => setPassword(e.target.value)} type="password" placeholder="mínimo 6 caracteres" />
            </div>
            <div className="mb-3">
              <label className="form-label">Perfil</label>
              <select
                className="form-select"
                value={role}
                onChange={(e) => {
                  const v = e.target.value;
                  if (v === "ADMIN" || v === "OPERADOR") setRole(v);
                }}
              >
                <option value="OPERADOR">Operador</option>
                <option value="ADMIN">Admin</option>
              </select>
            </div>

            <button className="btn btn-danger w-100" type="button" onClick={onSave} disabled={saving}>
              {saving ? "Salvando..." : "Salvar usuário"}
            </button>
          </div>
        </div>
      </div>

      <div className="col-lg-7">
        <div className="card shadow-sm border-0" style={{ borderRadius: 14 }}>
          <div className="card-body">
            <div className="d-flex justify-content-between align-items-center mb-3">
              <div>
                <div className="fw-bold" style={{ color: "#2c3e50" }}>
                  Usuários
                </div>
                <div className="text-muted" style={{ fontSize: 13 }}>
                  Quem pode entrar no sistema.
                </div>
              </div>
              <button className="btn btn-outline-secondary" type="button" onClick={load} disabled={loading}>
                <i className="bi bi-arrow-clockwise me-2" />
                Atualizar
              </button>
            </div>

            <div className="table-responsive" style={{ maxHeight: "70vh" }}>
              <table className="table table-hover align-middle mb-0">
                <thead className="table-light" style={{ position: "sticky", top: 0, zIndex: 1 }}>
                  <tr>
                    <th>E-mail</th>
                    <th>Nome</th>
                    <th>Perfil</th>
                    <th>Criado</th>
                  </tr>
                </thead>
                <tbody>
                  {loading ? (
                    <tr>
                      <td colSpan={4} className="text-center text-muted p-5">
                        Carregando...
                      </td>
                    </tr>
                  ) : items.length === 0 ? (
                    <tr>
                      <td colSpan={4} className="text-center text-muted p-5">
                        Nenhum usuário.
                      </td>
                    </tr>
                  ) : (
                    items.map((u) => (
                      <tr key={u.id}>
                        <td className="fw-semibold">{u.email}</td>
                        <td>{u.name}</td>
                        <td>
                          <span className={`badge ${u.role === "ADMIN" ? "text-bg-danger" : "text-bg-secondary"}`}>{u.role}</span>
                        </td>
                        <td className="text-muted" style={{ fontSize: 13 }}>
                          {new Date(u.createdAt).toLocaleDateString("pt-BR")}
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
