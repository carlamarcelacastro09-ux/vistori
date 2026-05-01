"use client";

import { useState } from "react";

export default function LoginForm() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError(null);

    const res = await fetch("/api/auth/login", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ email, password }),
    }).catch(() => null);

    setLoading(false);

    if (!res) {
      setError("Falha de conexão.");
      return;
    }

    const data = (await res.json().catch(() => null)) as { ok?: boolean; message?: string } | null;
    if (!res.ok || !data?.ok) {
      setError(data?.message ?? "Não foi possível entrar.");
      return;
    }

    window.location.href = "/";
  }

  return (
    <form className="card border-0 shadow-lg" onSubmit={onSubmit} style={{ borderRadius: 18 }}>
      <div className="p-4 p-md-5">
        <div className="d-flex align-items-center gap-3 mb-4">
          <img
            src="https://drive.google.com/thumbnail?id=1CrumSftM4zRqGe0jHIs04GGpOsEIITzT&sz=w300"
            alt="Logo Pissarro Vistorias"
            style={{
              width: 54,
              height: 54,
              objectFit: "contain",
              background: "#fff",
              borderRadius: 14,
              padding: 8,
              boxShadow: "0 10px 30px rgba(0,0,0,0.08)",
            }}
          />
          <div>
            <div className="fw-bold" style={{ color: "#e63946", fontSize: 18, letterSpacing: 0.2 }}>
              Pissarro Vistorias
            </div>
            <div className="text-muted" style={{ fontSize: 13 }}>
              Entre para acessar o sistema
            </div>
          </div>
        </div>

        <div className="mb-3">
          <label className="form-label">E-mail</label>
          <div className="input-group">
            <span className="input-group-text bg-white border-end-0" style={{ borderRadius: "12px 0 0 12px" }}>
              <i className="bi bi-envelope" />
            </span>
            <input
              className="form-control border-start-0"
              style={{ borderRadius: "0 12px 12px 0" }}
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
              autoComplete="email"
              placeholder="seuemail@exemplo.com"
            />
          </div>
        </div>

        <div className="mb-3">
          <label className="form-label">Senha</label>
          <div className="input-group">
            <span className="input-group-text bg-white border-end-0" style={{ borderRadius: "12px 0 0 12px" }}>
              <i className="bi bi-lock" />
            </span>
            <input
              className="form-control border-start-0"
              style={{ borderRadius: "0 12px 12px 0" }}
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
              autoComplete="current-password"
              placeholder="Digite sua senha"
            />
          </div>
        </div>

        {error ? <div className="alert alert-danger py-2 mb-3">{error}</div> : null}

        <button className="btn btn-danger w-100 py-2" type="submit" disabled={loading} style={{ borderRadius: 12, fontWeight: 700 }}>
          {loading ? "Entrando..." : "Entrar"}
        </button>
      </div>
    </form>
  );
}
