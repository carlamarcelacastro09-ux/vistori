"use client";

import { useEffect, useState } from "react";

type Tab = "entrar" | "cadastro";

export default function LoginForm() {
  const [tab, setTab] = useState<Tab>("entrar");

  const [allowsFirstSignup, setAllowsFirstSignup] = useState<boolean | null>(null);
  const [dbConnected, setDbConnected] = useState<boolean>(true);

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [nome, setNome] = useState("Administrador");
  const [regEmail, setRegEmail] = useState("");
  const [regPassword, setRegPassword] = useState("");
  const [regPassword2, setRegPassword2] = useState("");

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [signupOk, setSignupOk] = useState(false);

  useEffect(() => {
    let cancelled = false;
    fetch("/api/setup/status")
      .then((r) => r.json())
      .then((data: { allowsFirstSignup?: boolean; ok?: boolean; dbConnected?: boolean; message?: string }) => {
        if (cancelled) return;
        setAllowsFirstSignup(Boolean(data.ok && data.allowsFirstSignup));
        setDbConnected(data.dbConnected !== false);
      })
      .catch(() => {
        if (cancelled) return;
        setAllowsFirstSignup(null);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  async function onLoginSubmit(e: React.FormEvent) {
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

  async function onSignupSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError(null);

    if (regPassword !== regPassword2) {
      setError("As senhas não coincidem.");
      setLoading(false);
      return;
    }

    const res = await fetch("/api/setup/first-admin", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ email: regEmail, password: regPassword, name: nome }),
    }).catch(() => null);

    setLoading(false);

    if (!res) {
      setError("Falha de conexão.");
      return;
    }

    const data = (await res.json().catch(() => null)) as { ok?: boolean; message?: string } | null;
    if (!res.ok || !data?.ok) {
      setError(data?.message ?? "Não foi possível criar o usuário.");
      return;
    }

    setTab("entrar");
    setEmail(regEmail.toLowerCase());
    setPassword(regPassword);
    setError(null);
    setSignupOk(true);
  }

  return (
    <div className="card border-0 shadow-lg" style={{ borderRadius: 18 }}>
      <div className="p-4 p-md-5">
        <div className="d-flex align-items-center gap-3 mb-3">
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
              Entre ou faça o cadastro inicial
            </div>
          </div>
        </div>

        <div className="nav nav-pills nav-fill mb-4 gap-1 p-1 rounded-3 bg-light border" style={{ fontSize: 14 }}>
          <button
            type="button"
            className={`nav-link rounded-2 fw-semibold py-2 ${tab === "entrar" ? "active bg-danger text-white" : "text-secondary"}`}
            onClick={() => {
              setTab("entrar");
              setError(null);
              setSignupOk(false);
            }}
          >
            Entrar
          </button>
          <button
            type="button"
            className={`nav-link rounded-2 fw-semibold py-2 ${tab === "cadastro" ? "active bg-danger text-white" : "text-secondary"}`}
            onClick={() => {
              setTab("cadastro");
              setError(null);
            }}
            disabled={allowsFirstSignup === false}
          >
            Cadastrar (primeiro uso)
          </button>
        </div>

        {allowsFirstSignup === false ? (
          <p className="small text-muted mb-3 pb-3 border-bottom">
            O primeiro administrador já foi criado neste sistema. Para nova pessoa na loja, peça ao administrador em <strong>Usuários</strong>.
          </p>
        ) : null}

        {!dbConnected ? (
          <div className="alert alert-warning small py-2 mb-3">
            O servidor não conseguiu falar com o banco de dados (Neon). Verifique{" "}
            <strong>DATABASE_URL</strong> na Vercel e faça um <strong>Redeploy</strong>.
          </div>
        ) : null}

        {tab === "entrar" ? (
          <form onSubmit={onLoginSubmit}>
            {signupOk ? (
              <div className="alert alert-success small py-2 mb-3">Conta criada. Clique em <strong>Entrar</strong> com o mesmo e-mail e senha.</div>
            ) : null}
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
          </form>
        ) : (
          <form onSubmit={onSignupSubmit}>
            <p className="small text-muted mb-3">
              Use apenas na <strong>primeira vez</strong>: cria uma conta administrador. Depois outros usuários são cadastrados dentro do sistema.
            </p>

            <div className="mb-3">
              <label className="form-label">Seu nome</label>
              <input
                className="form-control"
                style={{ borderRadius: 12 }}
                value={nome}
                onChange={(e) => setNome(e.target.value)}
                required
                autoComplete="name"
              />
            </div>

            <div className="mb-3">
              <label className="form-label">E-mail (será seu login)</label>
              <input
                className="form-control"
                type="email"
                style={{ borderRadius: 12 }}
                value={regEmail}
                onChange={(e) => setRegEmail(e.target.value)}
                required
                autoComplete="email"
                placeholder="seuemail@exemplo.com"
              />
            </div>

            <div className="mb-3">
              <label className="form-label">Senha (mín. 6 caracteres)</label>
              <input
                className="form-control"
                type="password"
                style={{ borderRadius: 12 }}
                value={regPassword}
                onChange={(e) => setRegPassword(e.target.value)}
                required
                minLength={6}
                autoComplete="new-password"
              />
            </div>

            <div className="mb-3">
              <label className="form-label">Repita a senha</label>
              <input
                className="form-control"
                type="password"
                style={{ borderRadius: 12 }}
                value={regPassword2}
                onChange={(e) => setRegPassword2(e.target.value)}
                required
                minLength={6}
                autoComplete="new-password"
              />
            </div>

            {error ? <div className="alert alert-danger py-2 mb-3">{error}</div> : null}

            <button className="btn btn-danger w-100 py-2" type="submit" disabled={loading || allowsFirstSignup === false} style={{ borderRadius: 12, fontWeight: 700 }}>
              {loading ? "Salvando..." : "Criar conta e ir para Login"}
            </button>
          </form>
        )}
      </div>
    </div>
  );
}
