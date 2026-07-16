"use client";

import { useMemo, useState } from "react";

type InvoiceStatus = "AGUARDANDO" | "EMITIDA" | "LANCADO" | "ERRO";

type Row = {
  id: string;
  date: string;
  plate: string;
  customerName: string;
  paidValue: number;
  status: InvoiceStatus;
};

type Account = {
  id: string;
  description: string;
  amount: number;
  dueDate: string;
  status: "PENDENTE" | "PAGO";
  category: string;
  paidAt: string | null;
};

type ResetState = { loading: boolean; message: string | null };

const MONTHS = [
  "Janeiro", "Fevereiro", "Março", "Abril", "Maio", "Junho",
  "Julho", "Agosto", "Setembro", "Outubro", "Novembro", "Dezembro",
];

const CATEGORIES = ["Fornecedor", "Imposto", "Salário", "Aluguel", "Serviço", "Outros"];

function toBRL(value: number) {
  return value.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

function toBRDate(iso: string) {
  return new Date(iso).toLocaleDateString("pt-BR");
}

function monthKey(iso: string) {
  const d = new Date(iso);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
}

function monthLabel(key: string) {
  if (!key) return "";
  const [y, m] = key.split("-").map(Number);
  return `${MONTHS[m - 1]} ${y}`;
}

function todayMonthKey() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
}

export default function FinanceiroClient({
  rows,
  totalDay,
  initialAccounts,
}: {
  rows: Row[];
  totalDay: number;
  initialAccounts: Account[];
}) {
  const [selectedMonth, setSelectedMonth] = useState<string>(todayMonthKey());
  const [accounts, setAccounts] = useState<Account[]>(initialAccounts);
  const [tab, setTab] = useState<"resumo" | "despesas">("resumo");
  const [resetAll, setResetAll] = useState<ResetState>({ loading: false, message: null });
  const [resetOne, setResetOne] = useState<Record<string, ResetState>>({});
  const [message, setMessage] = useState<string | null>(null);

  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState<Account | null>(null);
  const [form, setForm] = useState({ description: "", amount: "", dueDate: "", category: "" });
  const [formLoading, setFormLoading] = useState(false);

  const months = useMemo(() => {
    const set = new Set<string>();
    rows.forEach((r) => set.add(monthKey(r.date)));
    accounts.forEach((a) => set.add(monthKey(a.dueDate)));
    const list = Array.from(set).sort().reverse();
    if (!list.includes(todayMonthKey())) list.unshift(todayMonthKey());
    return list;
  }, [rows, accounts]);

  const invoiceFiltered = useMemo(() => {
    return rows.filter((r) => monthKey(r.date) === selectedMonth);
  }, [rows, selectedMonth]);

  const accountsFiltered = useMemo(() => {
    return accounts.filter((a) => monthKey(a.dueDate) === selectedMonth);
  }, [accounts, selectedMonth]);

  const totals = useMemo(() => {
    const receita = invoiceFiltered
      .filter((r) => r.status === "EMITIDA" || r.status === "LANCADO")
      .reduce((sum, r) => sum + r.paidValue, 0);
    const totalNotas = invoiceFiltered.reduce((sum, r) => sum + r.paidValue, 0);
    const pendingCount = invoiceFiltered.filter((r) => r.status === "AGUARDANDO").length;
    const errorCount = invoiceFiltered.filter((r) => r.status === "ERRO").length;
    const despesas = accountsFiltered.reduce((sum, a) => sum + a.amount, 0);
    const despesasPagas = accountsFiltered.filter((a) => a.status === "PAGO").reduce((sum, a) => sum + a.amount, 0);
    const despesasPendentes = accountsFiltered.filter((a) => a.status === "PENDENTE").reduce((sum, a) => sum + a.amount, 0);
    return { receita, totalNotas, pendingCount, errorCount, despesas, despesasPagas, despesasPendentes, saldo: receita - despesas };
  }, [invoiceFiltered, accountsFiltered]);

  async function resetInspection(id: string) {
    setResetOne((prev) => ({ ...prev, [id]: { loading: true, message: null } }));
    const res = await fetch("/api/admin/reset-job", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ inspectionId: id }),
    }).catch(() => null);
    setResetOne((prev) => {
      const next = { ...prev };
      delete next[id];
      return next;
    });
    if (!res || !res.ok) {
      const data = await res?.json().catch(() => null);
      alert(data?.message ?? "Não foi possível reprocessar. Verifique permissões.");
      return;
    }
    window.location.reload();
  }

  async function resetAllErrors() {
    if (!confirm("Deseja voltar TODAS as vistorias com erro do mês para a fila de emissão?")) return;
    setResetAll({ loading: true, message: null });
    const res = await fetch("/api/admin/reset-job", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ allErrors: true }),
    }).catch(() => null);
    const data = await res?.json().catch(() => null);
    if (!res || !res.ok) {
      setResetAll({ loading: false, message: data?.message ?? "Erro ao resetar." });
      return;
    }
    setResetAll({ loading: false, message: `${data?.resetCount ?? 0} vistoria(s) voltaram para a fila.` });
    setTimeout(() => window.location.reload(), 1500);
  }

  function openForm(account?: Account) {
    if (account) {
      setEditing(account);
      setForm({
        description: account.description,
        amount: account.amount.toFixed(2),
        dueDate: account.dueDate.slice(0, 10),
        category: account.category || "",
      });
    } else {
      setEditing(null);
      setForm({ description: "", amount: "", dueDate: selectedMonth ? `${selectedMonth}-01` : "", category: "" });
    }
    setFormOpen(true);
  }

  function closeForm() {
    setFormOpen(false);
    setEditing(null);
    setForm({ description: "", amount: "", dueDate: "", category: "" });
  }

  async function saveAccount(e: React.FormEvent) {
    e.preventDefault();
    setFormLoading(true);

    const amount = Number(form.amount.replace(",", "."));
    const dueDate = new Date(form.dueDate);
    if (!form.description.trim() || Number.isNaN(amount) || amount <= 0 || Number.isNaN(dueDate.getTime())) {
      alert("Preencha descrição, valor e vencimento corretamente.");
      setFormLoading(false);
      return;
    }

    const payload = {
      description: form.description.trim(),
      amount,
      dueDate: form.dueDate,
      category: form.category || null,
    };

    const url = editing ? `/api/admin/accounts/${editing.id}` : "/api/admin/accounts";
    const method = editing ? "PUT" : "POST";
    const res = await fetch(url, {
      method,
      headers: { "content-type": "application/json" },
      body: JSON.stringify(payload),
    }).catch(() => null);
    const data = await res?.json().catch(() => null);

    setFormLoading(false);
    if (!res || !res.ok) {
      alert(data?.message ?? "Erro ao salvar conta.");
      return;
    }

    if (editing) {
      setAccounts((prev) => prev.map((a) => (a.id === editing.id ? { ...a, ...data.account } : a)));
    } else {
      setAccounts((prev) => [...prev, data.account]);
    }
    closeForm();
    setMessage(editing ? "Conta atualizada." : "Conta adicionada.");
    setTimeout(() => setMessage(null), 3000);
  }

  async function deleteAccount(id: string) {
    if (!confirm("Deseja excluir esta conta?")) return;
    const res = await fetch(`/api/admin/accounts/${id}`, { method: "DELETE" }).catch(() => null);
    if (!res || !res.ok) {
      alert("Erro ao excluir conta.");
      return;
    }
    setAccounts((prev) => prev.filter((a) => a.id !== id));
    setMessage("Conta excluída.");
    setTimeout(() => setMessage(null), 3000);
  }

  async function togglePaid(account: Account) {
    const action = account.status === "PAGO" ? "unpay" : "pay";
    const res = await fetch(`/api/admin/accounts/${account.id}`, {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ action }),
    }).catch(() => null);
    const data = await res?.json().catch(() => null);
    if (!res || !res.ok) {
      alert(data?.message ?? "Erro ao alterar status.");
      return;
    }
    setAccounts((prev) => prev.map((a) => (a.id === account.id ? { ...a, ...data.account } : a)));
  }

  const statusBadge = (status: InvoiceStatus) => {
    const map: Record<string, { cls: string; label: string }> = {
      AGUARDANDO: { cls: "bg-secondary-subtle text-secondary border border-secondary-subtle", label: "Aguardando" },
      EMITIDA: { cls: "bg-success-subtle text-success border border-success-subtle", label: "Emitida" },
      LANCADO: { cls: "bg-success-subtle text-success border border-success-subtle", label: "Lançada" },
      ERRO: { cls: "bg-danger-subtle text-danger border border-danger-subtle", label: "Erro" },
    };
    const s = map[status];
    return (
      <span className={`badge ${s.cls}`} style={{ fontWeight: 500, fontSize: 11, padding: "0.35em 0.65em" }}>
        {s.label}
      </span>
    );
  };

  const cardBase = "card border-0 shadow-sm h-100";
  const cardBody = "card-body py-2 px-3";

  return (
    <div className="d-flex flex-column gap-3">
      <div className="card border-0 shadow-sm" style={{ borderRadius: 12 }}>
        <div className="card-body py-3 px-3 d-flex flex-column flex-md-row justify-content-between align-items-md-center gap-3">
          <div>
            <h1 className="h4 fw-bold mb-1" style={{ color: "#2c3e50" }}>Financeiro</h1>
            <div className="text-muted" style={{ fontSize: 13 }}>Controle mensal de receitas, notas e contas a pagar.</div>
          </div>
          <div className="d-flex align-items-center gap-2">
            <label className="text-muted mb-0" style={{ fontSize: 13 }}>Mês</label>
            <select
              className="form-select form-select-sm"
              value={selectedMonth}
              onChange={(e) => setSelectedMonth(e.target.value)}
              style={{ minWidth: 160 }}
            >
              {months.map((m) => (
                <option key={m} value={m}>{monthLabel(m)}</option>
              ))}
            </select>
          </div>
        </div>
      </div>

      <div className="row g-2">
        <div className="col-6 col-md-3">
          <div className={cardBase} style={{ borderRadius: 12, background: "#f0f7ff" }}>
            <div className={cardBody}>
              <div className="text-muted" style={{ fontSize: 11, fontWeight: 500 }}>Receita do mês</div>
              <div className="fw-bold" style={{ fontSize: 20, color: "#0d6efd" }}>{toBRL(totals.receita)}</div>
            </div>
          </div>
        </div>
        <div className="col-6 col-md-3">
          <div className={cardBase} style={{ borderRadius: 12, background: "#fff5f5" }}>
            <div className={cardBody}>
              <div className="text-muted" style={{ fontSize: 11, fontWeight: 500 }}>Despesas do mês</div>
              <div className="fw-bold" style={{ fontSize: 20, color: "#dc3545" }}>{toBRL(totals.despesas)}</div>
            </div>
          </div>
        </div>
        <div className="col-6 col-md-3">
          <div className={cardBase} style={{ borderRadius: 12, background: "#e6f4ea" }}>
            <div className={cardBody}>
              <div className="text-muted" style={{ fontSize: 11, fontWeight: 500 }}>Pago no mês</div>
              <div className="fw-bold" style={{ fontSize: 20, color: "#198754" }}>{toBRL(totals.despesasPagas)}</div>
            </div>
          </div>
        </div>
        <div className="col-6 col-md-3">
          <div className={cardBase} style={{ borderRadius: 12, background: totals.saldo >= 0 ? "#e6f4ea" : "#f8f9fa" }}>
            <div className={cardBody}>
              <div className="text-muted" style={{ fontSize: 11, fontWeight: 500 }}>Saldo</div>
              <div className="fw-bold" style={{ fontSize: 20, color: totals.saldo >= 0 ? "#198754" : "#6c757d" }}>{toBRL(totals.saldo)}</div>
            </div>
          </div>
        </div>
      </div>

      <div className="card border-0 shadow-sm" style={{ borderRadius: 12 }}>
        <div className="card-body p-2">
          <div className="nav nav-pills nav-fill" style={{ fontSize: 14 }}>
            <button
              className={`nav-link ${tab === "resumo" ? "active" : ""}`}
              onClick={() => setTab("resumo")}
              style={{ borderRadius: 10 }}
            >
              Resumo de Notas
            </button>
            <button
              className={`nav-link ${tab === "despesas" ? "active" : ""}`}
              onClick={() => setTab("despesas")}
              style={{ borderRadius: 10 }}
            >
              Contas a Pagar / Pagas
            </button>
          </div>
        </div>
      </div>

      {message ? (
        <div className="alert alert-info py-2 mb-0" style={{ fontSize: 13 }}>{message}</div>
      ) : null}

      {tab === "resumo" ? (
        <div className="d-flex flex-column gap-3">
          <div className="card border-0 shadow-sm" style={{ borderRadius: 12 }}>
            <div className="card-body py-3 px-3">
              <div className="d-flex flex-column flex-md-row justify-content-between align-items-md-center gap-2 mb-3">
                <h2 className="h6 fw-bold mb-0" style={{ color: "#2c3e50" }}>
                  Notas de {monthLabel(selectedMonth)}
                </h2>
                <div className="d-flex flex-wrap gap-2 align-items-center">
                  <span className="badge bg-success-subtle text-success border border-success-subtle" style={{ fontSize: 11 }}>
                    Lançadas: {invoiceFiltered.filter((r) => r.status === "EMITIDA" || r.status === "LANCADO").length}
                  </span>
                  <span className="badge bg-secondary-subtle text-secondary border border-secondary-subtle" style={{ fontSize: 11 }}>
                    Aguardando: {totals.pendingCount}
                  </span>
                  <span className="badge bg-danger-subtle text-danger border border-danger-subtle" style={{ fontSize: 11 }}>
                    Erros: {totals.errorCount}
                  </span>
                  {totals.errorCount > 0 && (
                    <button className="btn btn-warning btn-sm" onClick={resetAllErrors} disabled={resetAll.loading}>
                      {resetAll.loading ? "Resetando..." : "Reprocessar erros"}
                    </button>
                  )}
                </div>
              </div>

              {resetAll.message ? (
                <div className="alert alert-info py-2 mb-3" style={{ fontSize: 13 }}>{resetAll.message}</div>
              ) : null}

              {invoiceFiltered.length === 0 ? (
                <div className="text-center text-muted py-4">Nenhuma nota neste mês.</div>
              ) : (
                <div className="row g-2">
                  {invoiceFiltered.map((r) => {
                    const resetting = resetOne[r.id]?.loading;
                    return (
                      <div className="col-12 col-md-6" key={r.id}>
                        <div className="card border-0 shadow-sm" style={{ borderRadius: 10, background: "#fafbfc" }}>
                          <div className="card-body py-2 px-3 d-flex justify-content-between align-items-center gap-2">
                            <div className="flex-grow-1 min-w-0">
                              <div className="d-flex align-items-center gap-2 mb-1">
                                <span className="fw-semibold text-truncate" style={{ color: "#2c3e50" }}>{r.plate || "-"}</span>
                                {statusBadge(r.status)}
                              </div>
                              <div className="text-muted text-truncate" style={{ fontSize: 12 }}>{r.customerName}</div>
                            </div>
                            <div className="text-end" style={{ minWidth: 90 }}>
                              <div className="fw-semibold" style={{ fontSize: 14 }}>{toBRL(r.paidValue)}</div>
                              {r.status === "ERRO" ? (
                                <button
                                  className="btn btn-link text-decoration-none p-0"
                                  style={{ fontSize: 11 }}
                                  onClick={() => resetInspection(r.id)}
                                  disabled={resetting}
                                >
                                  {resetting ? "..." : "Reprocessar"}
                                </button>
                              ) : null}
                            </div>
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}

              {invoiceFiltered.length > 0 && (
                <div className="d-flex justify-content-between align-items-center mt-3 pt-3 border-top" style={{ fontSize: 13 }}>
                  <span className="text-muted">Total de notas: {toBRL(totals.totalNotas)}</span>
                  <span className="fw-semibold">Faturamento hoje: {toBRL(totalDay)}</span>
                </div>
              )}
            </div>
          </div>
        </div>
      ) : (
        <div className="d-flex flex-column gap-3">
          <div className="card border-0 shadow-sm" style={{ borderRadius: 12 }}>
            <div className="card-body py-3 px-3">
              <div className="d-flex flex-column flex-md-row justify-content-between align-items-md-center gap-2 mb-3">
                <h2 className="h6 fw-bold mb-0" style={{ color: "#2c3e50" }}>Contas de {monthLabel(selectedMonth)}</h2>
                <button className="btn btn-primary btn-sm" onClick={() => openForm()}>
                  + Nova conta
                </button>
              </div>

              {formOpen && (
                <form onSubmit={saveAccount} className="card border-0 shadow-sm mb-3" style={{ borderRadius: 10, background: "#f8f9fa" }}>
                  <div className="card-body p-3">
                    <div className="row g-2">
                      <div className="col-md-5">
                        <label className="form-label text-muted mb-1" style={{ fontSize: 12 }}>Descrição</label>
                        <input
                          className="form-control form-control-sm"
                          value={form.description}
                          onChange={(e) => setForm({ ...form, description: e.target.value })}
                          placeholder="Ex: Aluguel, Fornecedor..."
                          required
                        />
                      </div>
                      <div className="col-md-2">
                        <label className="form-label text-muted mb-1" style={{ fontSize: 12 }}>Valor</label>
                        <input
                          className="form-control form-control-sm"
                          type="number"
                          step="0.01"
                          min="0.01"
                          value={form.amount}
                          onChange={(e) => setForm({ ...form, amount: e.target.value })}
                          placeholder="0,00"
                          required
                        />
                      </div>
                      <div className="col-md-3">
                        <label className="form-label text-muted mb-1" style={{ fontSize: 12 }}>Vencimento</label>
                        <input
                          className="form-control form-control-sm"
                          type="date"
                          value={form.dueDate}
                          onChange={(e) => setForm({ ...form, dueDate: e.target.value })}
                          required
                        />
                      </div>
                      <div className="col-md-2">
                        <label className="form-label text-muted mb-1" style={{ fontSize: 12 }}>Categoria</label>
                        <select
                          className="form-select form-select-sm"
                          value={form.category}
                          onChange={(e) => setForm({ ...form, category: e.target.value })}
                        >
                          <option value="">—</option>
                          {CATEGORIES.map((c) => (
                            <option key={c} value={c}>{c}</option>
                          ))}
                        </select>
                      </div>
                    </div>
                    <div className="d-flex gap-2 mt-3">
                      <button className="btn btn-primary btn-sm" type="submit" disabled={formLoading}>
                        {formLoading ? "Salvando..." : (editing ? "Salvar" : "Adicionar")}
                      </button>
                      <button className="btn btn-outline-secondary btn-sm" type="button" onClick={closeForm}>
                        Cancelar
                      </button>
                    </div>
                  </div>
                </form>
              )}

              {accountsFiltered.length === 0 ? (
                <div className="text-center text-muted py-4">Nenhuma conta cadastrada neste mês.</div>
              ) : (
                <div className="table-responsive" style={{ borderRadius: 8 }}>
                  <table className="table table-sm table-hover align-middle mb-0" style={{ fontSize: 13 }}>
                    <thead className="table-light">
                      <tr>
                        <th>Vencimento</th>
                        <th>Descrição</th>
                        <th>Categoria</th>
                        <th className="text-end">Valor</th>
                        <th style={{ width: 100 }}>Status</th>
                        <th className="text-center" style={{ width: 120 }}>Ações</th>
                      </tr>
                    </thead>
                    <tbody>
                      {accountsFiltered.map((a) => (
                        <tr key={a.id}>
                          <td className="text-nowrap text-muted">{toBRDate(a.dueDate)}</td>
                          <td className="fw-medium">{a.description}</td>
                          <td>
                            {a.category ? (
                              <span className="badge bg-light text-secondary border" style={{ fontSize: 10 }}>{a.category}</span>
                            ) : (
                              <span className="text-muted">—</span>
                            )}
                          </td>
                          <td className="text-end fw-medium">{toBRL(a.amount)}</td>
                          <td>
                            {a.status === "PAGO" ? (
                              <span className="badge bg-success-subtle text-success border border-success-subtle" style={{ fontSize: 11 }}>Pago</span>
                            ) : (
                              <span className="badge bg-warning-subtle text-warning-emphasis border border-warning-subtle" style={{ fontSize: 11 }}>Pendente</span>
                            )}
                          </td>
                          <td className="text-center">
                            <button
                              className="btn btn-sm btn-link text-decoration-none py-0"
                              onClick={() => togglePaid(a)}
                            >
                              {a.status === "PAGO" ? "Reabrir" : "Pagar"}
                            </button>
                            <button
                              className="btn btn-sm btn-link text-decoration-none py-0 text-muted"
                              onClick={() => openForm(a)}
                            >
                              Editar
                            </button>
                            <button
                              className="btn btn-sm btn-link text-decoration-none py-0 text-danger"
                              onClick={() => deleteAccount(a.id)}
                            >
                              Excluir
                            </button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}

              {accountsFiltered.length > 0 && (
                <div className="d-flex justify-content-between align-items-center mt-3 pt-3 border-top" style={{ fontSize: 13 }}>
                  <span className="text-muted">
                    Pendentes: {toBRL(totals.despesasPendentes)} · Pagas: {toBRL(totals.despesasPagas)}
                  </span>
                  <span className="fw-semibold">Total: {toBRL(totals.despesas)}</span>
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
