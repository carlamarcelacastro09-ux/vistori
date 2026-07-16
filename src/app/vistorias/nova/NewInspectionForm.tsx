"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import Select from "react-select";

type StreetItem = {
  id: string;
  street: string;
  district: string;
  city: string;
  cep: string;
};

type Toast = { id: number; message: string; type: "success" | "error" };

function onlyDigits(v: string) {
  return v.replace(/\D/g, "");
}

function normalizePlate(v: string) {
  return v.toUpperCase().replace(/[^A-Z0-9]/g, "");
}

function isValidPlate(v: string) {
  const p = normalizePlate(v);
  return /^[A-Z]{3}\d{4}$/.test(p) || /^[A-Z]{3}\d[A-Z]\d{2}$/.test(p);
}

function isValidCpf(cpf: string) {
  const clean = cpf.replace(/\D/g, "");
  if (clean.length !== 11 || /^\d{11}$/.test(clean) === false) return false;
  if (new Set(clean).size === 1) return false;
  let sum = 0;
  for (let i = 0; i < 9; i++) sum += parseInt(clean[i]) * (10 - i);
  let digit = 11 - (sum % 11);
  if (digit >= 10) digit = 0;
  if (digit !== parseInt(clean[9])) return false;
  sum = 0;
  for (let i = 0; i < 10; i++) sum += parseInt(clean[i]) * (11 - i);
  digit = 11 - (sum % 11);
  if (digit >= 10) digit = 0;
  return digit === parseInt(clean[10]);
}

function isValidCnpj(cnpj: string) {
  const clean = cnpj.replace(/\D/g, "");
  if (clean.length !== 14 || /^\d{14}$/.test(clean) === false) return false;
  if (new Set(clean).size === 1) return false;
  const weights1 = [5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2];
  const weights2 = [6, 5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2];
  let sum = 0;
  for (let i = 0; i < 12; i++) sum += parseInt(clean[i]) * weights1[i];
  let digit = sum % 11;
  digit = digit < 2 ? 0 : 11 - digit;
  if (digit !== parseInt(clean[12])) return false;
  sum = 0;
  for (let i = 0; i < 13; i++) sum += parseInt(clean[i]) * weights2[i];
  digit = sum % 11;
  digit = digit < 2 ? 0 : 11 - digit;
  return digit === parseInt(clean[13]);
}

function formatCpfCnpj(input: string) {
  const d = onlyDigits(input);
  if (d.length <= 11) {
    const parts = [d.slice(0, 3), d.slice(3, 6), d.slice(6, 9), d.slice(9, 11)];
    let out = parts[0] ?? "";
    if (parts[1]) out += `.${parts[1]}`;
    if (parts[2]) out += `.${parts[2]}`;
    if (parts[3]) out += `-${parts[3]}`;
    return out;
  }
  const parts = [d.slice(0, 2), d.slice(2, 5), d.slice(5, 8), d.slice(8, 12), d.slice(12, 14)];
  let out = parts[0] ?? "";
  if (parts[1]) out += `.${parts[1]}`;
  if (parts[2]) out += `.${parts[2]}`;
  if (parts[3]) out += `/${parts[3]}`;
  if (parts[4]) out += `-${parts[4]}`;
  return out;
}

function parseBRL(value: string) {
  const s = value.trim().replace(/[^\d,]/g, "");
  const normalized = s.replace(/\./g, "").replace(",", ".");
  const n = Number(normalized);
  return Number.isFinite(n) && n >= 0 ? n : null;
}

function toBRL(value: number) {
  return value.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

const CITY_OPTIONS = [
  { value: "PRADOPOLIS", label: "Pradópolis" },
  { value: "DUMONT", label: "Dumont" },
  { value: "RIBEIRAO_PRETO", label: "Ribeirão Preto" },
  { value: "GUATAPARA", label: "Guatapará" },
  { value: "SERTAOZINHO", label: "Sertãozinho" },
  { value: "OUTROS", label: "Outros" },
] as const;

type CityMode = (typeof CITY_OPTIONS)[number]["value"];

const cityModeToCity = (mode: CityMode, customCity: string) => {
  if (mode === "OUTROS") return customCity.trim().toUpperCase();
  return mode.replace(/_/g, " ");
};

const customSelectStyles = {
  control: (base: any) => ({
    ...base,
    borderRadius: 8,
    minHeight: 42,
    borderColor: "#dee2e6",
  }),
  option: (base: any, state: { isSelected: boolean; isFocused: boolean }) => ({
    ...base,
    backgroundColor: state.isSelected ? "#0d6efd" : state.isFocused ? "#e7f1ff" : "white",
    color: state.isSelected ? "white" : "#212529",
  }),
};

const schema = z
  .object({
    paidValue: z.string().min(1, "Valor pago obrigatório"),
    plate: z.string().min(1, "Placa obrigatória").refine(isValidPlate, "Placa inválida"),
    vehicleModel: z.string().min(2, "Modelo obrigatório"),
    vehicleBrand: z.string().min(2, "Marca obrigatória"),
    customerDoc: z
      .string()
      .min(1, "CPF/CNPJ obrigatório")
      .refine((v) => onlyDigits(v).length === 11 || onlyDigits(v).length === 14, "CPF/CNPJ inválido")
      .refine((v) => {
        const d = onlyDigits(v);
        return d.length === 11 ? isValidCpf(d) : isValidCnpj(d);
      }, "CPF/CNPJ com dígitos verificadores inválidos"),
    customerName: z.string().min(3, "Nome obrigatório"),
    cityMode: z.enum(["PRADOPOLIS", "DUMONT", "RIBEIRAO_PRETO", "GUATAPARA", "SERTAOZINHO", "OUTROS"]),
    customCity: z.string().optional(),
    cep: z.string().length(8, "CEP deve ter 8 dígitos"),
    street: z.string().min(3, "Rua obrigatória"),
    number: z.string().min(1, "Número obrigatório"),
    district: z.string().min(2, "Bairro obrigatório"),
  })
  .refine(
    (data) => {
      if (data.cityMode === "OUTROS") return data.customCity && data.customCity.trim().length >= 2;
      return true;
    },
    { message: "Digite a cidade", path: ["customCity"] }
  );

type FormData = z.infer<typeof schema>;

export default function NewInspectionForm() {
  const {
    register,
    handleSubmit,
    watch,
    setValue,
    reset,
    trigger,
    formState: { errors, isSubmitting, isValid },
  } = useForm<FormData>({
    resolver: zodResolver(schema),
    defaultValues: {
      paidValue: "25,00",
      cityMode: "PRADOPOLIS",
      customCity: "",
    },
    mode: "onChange",
  });

  const [saved, setSaved] = useState(false);
  const [toasts, setToasts] = useState<Toast[]>([]);
  const [customerLookupLoading, setCustomerLookupLoading] = useState(false);
  const [vehicleLookupLoading, setVehicleLookupLoading] = useState(false);
  const [plateHistoryLoading, setPlateHistoryLoading] = useState(false);

  const [streetQuery, setStreetQuery] = useState("");
  const [streetResults, setStreetResults] = useState<StreetItem[]>([]);
  const [streetOpen, setStreetOpen] = useState(false);
  const streetReqId = useRef(0);

  const watched = watch();
  const cityMode = watched.cityMode;
  const actualCity = useMemo(() => cityModeToCity(cityMode, watched.customCity || ""), [cityMode, watched.customCity]);
  const isPradopolis = cityMode === "PRADOPOLIS";

  const paidValueNumber = useMemo(() => parseBRL(watched.paidValue), [watched.paidValue]);
  const [hasRecentInspection, setHasRecentInspection] = useState(false);

  function showToast(message: string, type: "success" | "error") {
    const id = Date.now() + Math.random();
    setToasts((prev) => [...prev, { id, message, type }]);
    setTimeout(() => setToasts((prev) => prev.filter((t) => t.id !== id)), 4000);
  }

  // Verifica placa nos últimos 30 dias
  useEffect(() => {
    const normalized = normalizePlate(watched.plate || "");
    if (!isValidPlate(normalized)) return;

    let cancelled = false;
    const t = setTimeout(async () => {
      setPlateHistoryLoading(true);
      const res = await fetch(`/api/inspections/plate-history?plate=${encodeURIComponent(normalized)}`).catch(() => null);
      setPlateHistoryLoading(false);
      if (!res || !res.ok) return;
      const data = (await res.json().catch(() => null)) as { ok?: boolean; hasRecentInspection?: boolean; lastDate?: string | null } | null;
      if (cancelled || !data?.ok) return;

      setHasRecentInspection(!!data.hasRecentInspection);
      if (data.hasRecentInspection) {
        setValue("paidValue", "1,00");
      } else if (watched.paidValue === "1,00") {
        setValue("paidValue", "25,00");
      }
    }, 600);

    return () => {
      cancelled = true;
      clearTimeout(t);
    };
  }, [watched.plate, setValue, watched.paidValue]);

  // Autocomplete de ruas para Pradópolis
  useEffect(() => {
    if (!isPradopolis) return;
    const q = streetQuery.trim();
    if (q.length < 3) {
      setStreetResults([]);
      return;
    }

    const id = ++streetReqId.current;
    const t = setTimeout(() => {
      fetch(`/api/streets?query=${encodeURIComponent(q)}&city=${encodeURIComponent("PRADOPOLIS")}`, { method: "GET" })
        .then(async (r) => {
          if (!r.ok) return null;
          return (await r.json()) as { ok?: boolean; streets?: StreetItem[] };
        })
        .then((data) => {
          if (streetReqId.current !== id) return;
          setStreetResults(data?.streets ?? []);
        })
        .catch(() => {
          if (streetReqId.current !== id) return;
          setStreetResults([]);
        });
    }, 250);

    return () => clearTimeout(t);
  }, [streetQuery, isPradopolis]);

  function selectStreet(item: StreetItem) {
    setValue("street", item.street.toUpperCase());
    setValue("cep", onlyDigits(item.cep));
    setValue("district", item.district.toUpperCase());
    setStreetOpen(false);
    setStreetQuery("");
    trigger(["street", "cep", "district"]);
  }

  async function lookupCustomer() {
    const doc = onlyDigits(watched.customerDoc || "");
    if (doc.length !== 11 && doc.length !== 14) return;

    setCustomerLookupLoading(true);
    const res = await fetch(`/api/customers/lookup?doc=${encodeURIComponent(doc)}`).catch(() => null);
    setCustomerLookupLoading(false);
    if (!res || !res.ok) return;

    const data = (await res.json().catch(() => null)) as
      | { ok?: boolean; customer?: { name: string; cep: string; street: string; number: string; district: string; city: string } | null }
      | null;

    if (data?.customer) {
      setValue("customerName", (data.customer.name || "").toUpperCase());
      const cCity = (data.customer.city || "").toUpperCase();

      // Tenta mapear cidade do cadastro para o select
      const mapped = CITY_OPTIONS.find((c) => c.value === cCity || c.value.replace(/_/g, " ") === cCity);
      if (mapped) {
        setValue("cityMode", mapped.value as CityMode);
      } else {
        setValue("cityMode", "OUTROS");
        setValue("customCity", cCity);
      }

      setValue("cep", onlyDigits(data.customer.cep || ""));
      setValue("street", (data.customer.street || "").toUpperCase());
      setValue("number", (data.customer.number || "").toUpperCase());
      setValue("district", (data.customer.district || "").toUpperCase());
      trigger();
      showToast("Cliente encontrado e dados preenchidos.", "success");
      return;
    }

    showToast("Cliente não encontrado. Preencha os dados para cadastrar.", "error");
  }

  async function lookupVehicleModel() {
    const model = watched.vehicleModel?.trim().toUpperCase();
    if (!model || model.length < 2) return;

    setVehicleLookupLoading(true);
    const res = await fetch(`/api/vehicles/lookup?model=${encodeURIComponent(model)}`).catch(() => null);
    setVehicleLookupLoading(false);
    if (!res || !res.ok) return;

    const data = (await res.json().catch(() => null)) as { ok?: boolean; vehicle?: { model: string; brand: string } | null } | null;

    if (data?.vehicle?.brand) {
      setValue("vehicleBrand", data.vehicle.brand.toUpperCase());
    }
  }

  async function onSubmit(data: FormData) {
    const paid = parseBRL(data.paidValue);
    if (paid === null) {
      showToast("Valor pago inválido.", "error");
      return;
    }

    const city = cityModeToCity(data.cityMode, data.customCity || "");

    const payload = {
      paidValue: paid,
      noteValue: hasRecentInspection ? 0.01 : 25,
      plate: normalizePlate(data.plate),
      vehicleModel: data.vehicleModel.toUpperCase(),
      vehicleBrand: data.vehicleBrand.toUpperCase(),
      customerDoc: onlyDigits(data.customerDoc),
      customerName: data.customerName.toUpperCase(),
      cep: onlyDigits(data.cep),
      street: data.street.toUpperCase(),
      number: data.number.toUpperCase(),
      district: data.district.toUpperCase(),
      city,
    };

    const res = await fetch("/api/inspections", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(payload),
    }).catch(() => null);

    if (!res) {
      showToast("Falha de conexão.", "error");
      return;
    }

    const json = (await res.json().catch(() => null)) as { ok?: boolean; message?: string; fields?: Record<string, string> } | null;

    if (!res.ok || !json?.ok) {
      showToast(json?.message ?? "Não foi possível salvar.", "error");
      return;
    }

    setSaved(true);
    showToast("Vistoria salva com sucesso! Aguardando robô.", "success");
  }

  const sections = useMemo(() => {
    const financeiro = paidValueNumber !== null && paidValueNumber > 0;
    const veiculo = isValidPlate(watched.plate || "") && watched.vehicleModel?.length >= 2 && watched.vehicleBrand?.length >= 2;
    const cliente =
      onlyDigits(watched.customerDoc || "").length >= 11 &&
      watched.customerName?.length >= 3 &&
      onlyDigits(watched.cep || "").length === 8 &&
      watched.street?.length >= 3 &&
      watched.number?.length >= 1 &&
      watched.district?.length >= 2 &&
      actualCity.length >= 2;
    return { financeiro, veiculo, cliente };
  }, [watched, paidValueNumber, actualCity]);

  const progress = Math.round((Object.values(sections).filter(Boolean).length / Object.keys(sections).length) * 100);

  if (saved) {
    return (
      <div className="card border-0 shadow-sm p-4 text-center" style={{ borderRadius: 16 }}>
        <div
          className="d-inline-flex align-items-center justify-content-center mx-auto mb-3"
          style={{ width: 72, height: 72, borderRadius: "50%", background: "#e6f4ea", color: "#198754" }}
        >
          <i className="bi bi-check-lg" style={{ fontSize: 40 }} />
        </div>
        <h2 className="h4 fw-bold mb-2" style={{ color: "#2c3e50" }}>Vistoria salva!</h2>
        <p className="text-muted mb-4">A nota será emitida automaticamente pelo robô.</p>
        <div className="d-flex gap-2 justify-content-center">
          <button className="btn btn-outline-secondary" onClick={() => { reset(); setSaved(false); }}>Nova vistoria</button>
          <a className="btn btn-primary" href="/vistorias">Ver relação de notas</a>
        </div>
      </div>
    );
  }

  const SectionHeader = ({ icon, title, done, color }: { icon: string; title: string; done: boolean; color: string }) => (
    <div className="d-flex align-items-center gap-2 mb-3">
      <div
        className="d-flex align-items-center justify-content-center shadow-sm"
        style={{
          width: 32,
          height: 32,
          borderRadius: 10,
          background: done ? "#198754" : color,
          color: "white",
          fontSize: 16,
        }}
      >
        <i className={`bi ${done ? "bi-check-lg" : icon}`} />
      </div>
      <div>
        <h3 className="h6 fw-bold mb-0" style={{ color: "#2c3e50" }}>{title}</h3>
        <div className="text-muted" style={{ fontSize: 11 }}>{done ? "Preenchido" : "Pendente"}</div>
      </div>
    </div>
  );

  const inputClass = (field: keyof FormData) =>
    `form-control text-uppercase ${errors[field] ? "is-invalid" : ""}`;

  const sectionCard = (children: React.ReactNode, color: string) => (
    <div className="card border-0 shadow-sm" style={{ borderRadius: 16, borderLeft: `4px solid ${color}` }}>
      <div className="card-body p-4">{children}</div>
    </div>
  );

  return (
    <>
      <div className="card border-0 shadow-sm mb-3" style={{ borderRadius: 16, position: "sticky", top: 0, zIndex: 100 }}>
        <div className="card-body">
          <div className="d-flex flex-column flex-lg-row justify-content-between align-items-lg-center gap-3">
            <div>
              <h2 className="h4 fw-bold mb-1" style={{ color: "#2c3e50" }}>Nova Vistoria</h2>
              <div className="text-muted" style={{ fontSize: 13 }}>Preencha os dados para registrar e enviar ao robô.</div>
            </div>
            <div className="d-flex align-items-center gap-3 flex-wrap">
              <div className="d-flex align-items-center gap-2" style={{ minWidth: 180 }}>
                <label className="form-label fw-bold mb-0 text-nowrap" style={{ fontSize: 13 }}>Valor Pago:</label>
                <div className="input-group">
                  <span className="input-group-text bg-white border-end-0 py-1">
                    <i className="bi bi-currency-dollar text-muted" />
                  </span>
                  <input
                    {...register("paidValue")}
                    className={`form-control border-start-0 ps-0 py-1 ${errors.paidValue ? "is-invalid" : ""}`}
                    placeholder="0,00"
                    style={{ minWidth: 90 }}
                  />
                </div>
              </div>
              {hasRecentInspection ? (
                <span className="badge bg-danger-subtle text-danger border" style={{ fontSize: 11 }}>
                  Placa &lt;30 dias
                </span>
              ) : null}
              <div className="d-flex align-items-center gap-2" style={{ minWidth: 140 }}>
                <div className="progress flex-grow-1" style={{ height: 8, borderRadius: 4, minWidth: 80 }}>
                  <div className="progress-bar bg-success" role="progressbar" style={{ width: `${progress}%` }} />
                </div>
                <div className="fw-bold text-success" style={{ fontSize: 14, minWidth: 36, textAlign: "right" }}>{progress}%</div>
              </div>
            </div>
          </div>
          {errors.paidValue ? <div className="invalid-feedback d-block mt-2">{errors.paidValue.message}</div> : null}
        </div>
      </div>

      <form onSubmit={handleSubmit(onSubmit)}>
        <div className="d-flex flex-column gap-4">
          {/* Veículo */}
          {sectionCard(
            <>
              <SectionHeader icon="bi-car-front" title="Veículo" done={sections.veiculo} color="#0d6efd" />
              <div className="row g-3">
                <div className="col-md-4">
                  <label className="form-label fw-bold">Placa</label>
                  <div className="input-group">
                    <span className="input-group-text bg-white border-end-0">
                      <i className="bi bi-car-front text-muted" />
                    </span>
                    <input
                      {...register("plate")}
                      className={`form-control border-start-0 ps-0 ${errors.plate ? "is-invalid" : ""}`}
                      placeholder="ABC-1234"
                    />
                  </div>
                  {errors.plate ? <div className="invalid-feedback">{errors.plate.message}</div> : null}
                </div>
                <div className="col-md-4">
                  <label className="form-label fw-bold">Modelo</label>
                  <div className="input-group">
                    <span className="input-group-text bg-white border-end-0">
                      <i className="bi bi-search text-muted" />
                    </span>
                    <input
                      {...register("vehicleModel")}
                      className={`form-control border-start-0 ps-0 ${errors.vehicleModel ? "is-invalid" : ""}`}
                      placeholder="Ex.: UNO"
                      onBlur={() => lookupVehicleModel()}
                    />
                  </div>
                  {errors.vehicleModel ? <div className="invalid-feedback">{errors.vehicleModel.message}</div> : null}
                  {vehicleLookupLoading ? (
                    <div className="text-muted mt-1" style={{ fontSize: 12 }}>
                      <span className="spinner-border spinner-border-sm me-1" role="status" aria-hidden="true" />
                      Buscando marca...
                    </div>
                  ) : null}
                </div>
                <div className="col-md-4">
                  <label className="form-label fw-bold">Marca</label>
                  <div className="input-group">
                    <span className="input-group-text bg-white border-end-0">
                      <i className="bi bi-building text-muted" />
                    </span>
                    <input {...register("vehicleBrand")} className={`form-control border-start-0 ps-0 ${errors.vehicleBrand ? "is-invalid" : ""}`} placeholder="Ex.: FIAT" />
                  </div>
                  {errors.vehicleBrand ? <div className="invalid-feedback">{errors.vehicleBrand.message}</div> : null}
                </div>
              </div>
            </>,
            "#0d6efd"
          )}

          {/* Cliente e Endereço */}
          {sectionCard(
            <>
              <SectionHeader icon="bi-person" title="Cliente e Endereço" done={sections.cliente} color="#6f42c1" />
              <div className="row g-3">
                <div className="col-md-5">
                  <label className="form-label fw-bold">CPF / CNPJ</label>
                  <div className="input-group">
                    <span className="input-group-text bg-white border-end-0">
                      <i className="bi bi-person-vcard text-muted" />
                    </span>
                    <input
                      {...register("customerDoc")}
                      className={`form-control border-start-0 ps-0 ${errors.customerDoc ? "is-invalid" : ""}`}
                      onChange={(e) => setValue("customerDoc", formatCpfCnpj(e.target.value))}
                      onBlur={() => lookupCustomer()}
                      placeholder="CPF ou CNPJ"
                    />
                  </div>
                  {errors.customerDoc ? <div className="invalid-feedback">{errors.customerDoc.message}</div> : null}
                  {customerLookupLoading ? (
                    <div className="text-muted mt-1" style={{ fontSize: 12 }}>
                      <span className="spinner-border spinner-border-sm me-1" role="status" aria-hidden="true" />
                      Buscando cliente...
                    </div>
                  ) : null}
                </div>
                <div className="col-md-7">
                  <label className="form-label fw-bold">Nome / Razão Social</label>
                  <div className="input-group">
                    <span className="input-group-text bg-white border-end-0">
                      <i className="bi bi-person text-muted" />
                    </span>
                    <input
                      {...register("customerName")}
                      className={`form-control border-start-0 ps-0 ${errors.customerName ? "is-invalid" : ""}`}
                      placeholder="NOME COMPLETO"
                    />
                  </div>
                  {errors.customerName ? <div className="invalid-feedback">{errors.customerName.message}</div> : null}
                </div>

                <div className="col-md-6">
                  <label className="form-label fw-bold">Cidade</label>
                  <Select
                    options={CITY_OPTIONS}
                    value={CITY_OPTIONS.find((c) => c.value === cityMode)}
                    onChange={(opt) => {
                      const value = (opt?.value as CityMode) || "PRADOPOLIS";
                      setValue("cityMode", value);
                      setValue("street", "");
                      setValue("cep", "");
                      setValue("district", "");
                      setStreetQuery("");
                      setStreetResults([]);
                      trigger(["street", "cep", "district"]);
                    }}
                    styles={customSelectStyles}
                    placeholder="Selecione..."
                    isSearchable={false}
                    menuPortalTarget={typeof document !== "undefined" ? document.body : null}
                  />
                  {errors.cityMode ? <div className="invalid-feedback d-block">{errors.cityMode.message}</div> : null}
                </div>

                {cityMode === "OUTROS" ? (
                  <div className="col-md-6">
                    <label className="form-label fw-bold">Digite a Cidade</label>
                    <div className="input-group">
                      <span className="input-group-text bg-white border-end-0">
                        <i className="bi bi-geo text-muted" />
                      </span>
                      <input
                        {...register("customCity")}
                        className={`form-control border-start-0 ps-0 ${errors.customCity ? "is-invalid" : ""}`}
                        placeholder="Ex.: SÃO PAULO"
                      />
                    </div>
                    {errors.customCity ? <div className="invalid-feedback">{errors.customCity.message}</div> : null}
                  </div>
                ) : null}

                <div className="col-md-8 position-relative">
                  <label className="form-label fw-bold">Rua / Logradouro</label>
                  <div className="input-group">
                    <span className="input-group-text bg-white border-end-0">
                      <i className="bi bi-geo-alt text-muted" />
                    </span>
                    <input
                      {...register("street")}
                      className={`form-control text-uppercase border-start-0 ps-0 ${errors.street ? "is-invalid" : ""}`}
                      placeholder={isPradopolis ? "Busque pela rua..." : "Digite a rua"}
                      disabled={!isPradopolis && cityMode !== "OUTROS" && !actualCity}
                      onChange={(e) => {
                        const v = e.target.value.toUpperCase();
                        setValue("street", v);
                        if (isPradopolis) {
                          setStreetQuery(v);
                          setStreetOpen(true);
                          setValue("cep", "");
                          setValue("district", "");
                          if (v.trim().length < 3) setStreetResults([]);
                        }
                      }}
                      onFocus={() => {
                        if (isPradopolis && watched.street?.trim().length >= 3) setStreetOpen(true);
                      }}
                      onBlur={() => setTimeout(() => setStreetOpen(false), 150)}
                    />
                  </div>
                  {errors.street ? <div className="invalid-feedback d-block">{errors.street.message}</div> : null}
                  {isPradopolis && streetOpen && streetResults.length > 0 ? (
                    <div
                      className="list-group position-absolute w-100 shadow-sm"
                      style={{ zIndex: 20, maxHeight: 240, overflowY: "auto" }}
                    >
                      {streetResults.map((r) => (
                        <button
                          type="button"
                          key={r.id}
                          className="list-group-item list-group-item-action text-start"
                          onMouseDown={(e) => e.preventDefault()}
                          onClick={() => selectStreet(r)}
                        >
                          <div className="fw-bold" style={{ color: "#e63946" }}>{r.street}</div>
                          <div className="text-muted" style={{ fontSize: 12 }}>
                            {r.district} - {r.city} | CEP: {r.cep}
                          </div>
                        </button>
                      ))}
                    </div>
                  ) : null}
                </div>

                <div className="col-md-2">
                  <label className="form-label fw-bold">Nº</label>
                  <input {...register("number")} className={inputClass("number")} placeholder="123" />
                  {errors.number ? <div className="invalid-feedback">{errors.number.message}</div> : null}
                </div>
                <div className="col-md-4">
                  <label className="form-label fw-bold">Bairro</label>
                  <div className="input-group">
                    <span className="input-group-text bg-white border-end-0">
                      <i className="bi bi-map text-muted" />
                    </span>
                    <input
                      {...register("district")}
                      className={`form-control border-start-0 ps-0 ${errors.district ? "is-invalid" : ""}`}
                      placeholder="Bairro"
                      readOnly={isPradopolis}
                    />
                  </div>
                  {errors.district ? <div className="invalid-feedback">{errors.district.message}</div> : null}
                </div>
                <div className="col-md-3">
                  <label className="form-label fw-bold">CEP</label>
                  <div className="input-group">
                    <span className="input-group-text bg-white border-end-0">
                      <i className="bi bi-mailbox text-muted" />
                    </span>
                    <input
                      {...register("cep")}
                      className={`form-control border-start-0 ps-0 ${errors.cep ? "is-invalid" : ""}`}
                      placeholder="00000000"
                      maxLength={8}
                      readOnly={isPradopolis}
                    />
                  </div>
                  {errors.cep ? <div className="invalid-feedback">{errors.cep.message}</div> : null}
                </div>
              </div>
            </>,
            "#6f42c1"
          )}
        </div>

        <div className="d-flex gap-3 mt-4">
          <button className="btn btn-light border flex-grow-1 py-2" type="button" onClick={() => { reset(); setHasRecentInspection(false); }}>
            <i className="bi bi-trash me-2" />
            Limpar
          </button>
          <button className="btn btn-danger flex-grow-1 py-2" type="submit" disabled={isSubmitting || !isValid}>
            {isSubmitting ? (
              <>
                <span className="spinner-border spinner-border-sm me-2" role="status" aria-hidden="true" />
                Salvando...
              </>
            ) : (
              <>
                <i className="bi bi-save me-2" />
                Salvar vistoria
              </>
            )}
          </button>
        </div>
      </form>

      <div className="toast-container position-fixed bottom-0 end-0 p-3" style={{ zIndex: 1055 }}>
        {toasts.map((t) => (
          <div
            key={t.id}
            className={`toast show align-items-center text-white ${t.type === "success" ? "bg-success" : "bg-danger"}`}
            role="alert"
          >
            <div className="d-flex">
              <div className="toast-body">{t.message}</div>
              <button type="button" className="btn-close btn-close-white me-2 m-auto" onClick={() => setToasts((prev) => prev.filter((x) => x.id !== t.id))} />
            </div>
          </div>
        ))}
      </div>
    </>
  );
}
