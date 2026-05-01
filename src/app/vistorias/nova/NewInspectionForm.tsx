"use client";

import { useEffect, useMemo, useRef, useState } from "react";

type FieldErrors = Record<string, string>;

type StreetItem = {
  id: string;
  street: string;
  district: string;
  city: string;
  cep: string;
};

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

export default function NewInspectionForm() {
  const [paidValue, setPaidValue] = useState("");
  const [plate, setPlate] = useState("");
  const [vehicleModel, setVehicleModel] = useState("");
  const [vehicleBrand, setVehicleBrand] = useState("");
  const [customerDoc, setCustomerDoc] = useState("");
  const [customerName, setCustomerName] = useState("");
  const [cep, setCep] = useState("");
  const [street, setStreet] = useState("");
  const [number, setNumber] = useState("");
  const [district, setDistrict] = useState("");
  const [city, setCity] = useState("");

  const [loading, setLoading] = useState(false);
  const [errors, setErrors] = useState<FieldErrors>({});

  const [streetQuery, setStreetQuery] = useState("");
  const [streetResults, setStreetResults] = useState<StreetItem[]>([]);
  const [streetOpen, setStreetOpen] = useState(false);
  const streetReqId = useRef(0);
  const [customerLookupLoading, setCustomerLookupLoading] = useState(false);
  const [vehicleLookupLoading, setVehicleLookupLoading] = useState(false);
  const [cities, setCities] = useState<string[]>([]);

  const paidValueNumber = useMemo(() => {
    const s = paidValue.trim();
    if (!s) return NaN;
    const normalized = s.replace(/[^\d,.-]/g, "").replace(/\./g, "").replace(",", ".");
    const n = Number(normalized);
    return Number.isFinite(n) ? n : NaN;
  }, [paidValue]);

  useEffect(() => {
    fetch("/api/cities", { method: "GET" })
      .then(async (r) => {
        if (!r.ok) return null;
        return (await r.json()) as { ok?: boolean; cities?: string[] };
      })
      .then((data) => setCities(data?.cities ?? []))
      .catch(() => setCities([]));
  }, []);

  useEffect(() => {
    const q = streetQuery.trim();
    if (q.length < 3) return;

    const id = ++streetReqId.current;
    const t = setTimeout(() => {
      const cityParam = city.trim() ? `&city=${encodeURIComponent(city.trim())}` : "";
      fetch(`/api/streets?query=${encodeURIComponent(q)}${cityParam}`, { method: "GET" })
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
  }, [streetQuery, city]);

  function selectStreet(item: StreetItem) {
    setStreet(item.street.toUpperCase());
    setCep(item.cep);
    setDistrict(item.district.toUpperCase());
    setCity(item.city.toUpperCase());
    setCities((prev) => (prev.includes(item.city) ? prev : [...prev, item.city].sort()));
    setStreetOpen(false);
    setStreetQuery("");
  }

  async function lookupCustomer() {
    const doc = onlyDigits(customerDoc);
    if (doc.length !== 11 && doc.length !== 14) return;

    setCustomerLookupLoading(true);
    const res = await fetch(`/api/customers/lookup?doc=${encodeURIComponent(doc)}`).catch(() => null);
    setCustomerLookupLoading(false);
    if (!res || !res.ok) return;

    const data = (await res.json().catch(() => null)) as
      | { ok?: boolean; customer?: { name: string; cep: string; street: string; number: string; district: string; city: string } | null }
      | null;

    if (data?.customer) {
      setCustomerName((data.customer.name || "").toUpperCase());
      const cCity = (data.customer.city || "").toUpperCase();
      if (cCity) {
        setCity(cCity);
        setCities((prev) => (prev.includes(cCity) ? prev : [...prev, cCity].sort()));
      }

      setCep(onlyDigits(data.customer.cep || ""));
      setStreet((data.customer.street || "").toUpperCase());
      setNumber((data.customer.number || "").toUpperCase());
      setDistrict((data.customer.district || "").toUpperCase());
      setStreetOpen(false);
      setStreetQuery("");
      return;
    }

    alert("Cadastrar cliente novo! Cliente não encontrado.");
  }

  async function lookupVehicleModel() {
    const model = vehicleModel.trim().toUpperCase();
    if (model.length < 2) return;

    setVehicleLookupLoading(true);
    const res = await fetch(`/api/vehicles/lookup?model=${encodeURIComponent(model)}`).catch(() => null);
    setVehicleLookupLoading(false);
    if (!res || !res.ok) return;

    const data = (await res.json().catch(() => null)) as
      | { ok?: boolean; vehicle?: { model: string; brand: string } | null }
      | null;

    if (data?.vehicle?.brand) {
      setVehicleBrand(data.vehicle.brand.toUpperCase());
    }
  }

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setErrors({});

    const payload = {
      paidValue: paidValueNumber,
      plate,
      vehicleModel,
      vehicleBrand,
      customerDoc,
      customerName,
      cep,
      street,
      number,
      district,
      city,
    };

    const res = await fetch("/api/inspections", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(payload),
    }).catch(() => null);

    setLoading(false);

    if (!res) {
      alert("Falha de conexão.");
      return;
    }

    const data = (await res.json().catch(() => null)) as
      | { ok?: boolean; message?: string; fields?: FieldErrors }
      | null;

    if (!res.ok || !data?.ok) {
      if (data?.fields) setErrors(data.fields);
      alert(data?.message ?? "Não foi possível salvar.");
      return;
    }

    setPaidValue("");
    setPlate("");
    setVehicleModel("");
    setVehicleBrand("");
    setCustomerDoc("");
    setCustomerName("");
    setCep("");
    setStreet("");
    setNumber("");
    setDistrict("");
    setCity("");

    alert("Vistoria salva! Aguardando robô.");
  }

  const canSubmit =
    Number.isFinite(paidValueNumber) &&
    paidValueNumber > 0 &&
    isValidPlate(plate) &&
    normalizePlate(plate).length >= 7 &&
    onlyDigits(customerDoc).length >= 11 &&
    onlyDigits(cep).length === 8 &&
    vehicleModel.trim().length >= 2 &&
    vehicleBrand.trim().length >= 2 &&
    customerName.trim().length >= 3 &&
    street.trim().length >= 3 &&
    number.trim().length >= 1 &&
    district.trim().length >= 2 &&
    city.trim().length >= 2;

  return (
    <form className="card shadow-sm border-0 p-4" style={{ borderRadius: 12 }} onSubmit={onSubmit}>
      <div className="row g-4">
        <div className="col-12">
          <h2 className="h5 fw-bold mb-0" style={{ color: "#e63946" }}>
            Financeiro
          </h2>
        </div>
        <div className="col-md-6">
          <label className="form-label text-danger fw-bold">Valor Pago pelo Cliente (R$)</label>
          <input
            className={`form-control form-control-lg ${errors.paidValue ? "is-invalid" : ""}`}
            value={paidValue}
            onChange={(e) => setPaidValue(e.target.value)}
            placeholder="0,00"
          />
          {errors.paidValue ? <div className="invalid-feedback">{errors.paidValue}</div> : null}
        </div>

        <div className="col-12">
          <hr />
          <h2 className="h5 fw-bold mb-0" style={{ color: "#e63946" }}>
            Veículo
          </h2>
        </div>

        <div className="col-md-4">
          <label className="form-label fw-bold">Placa</label>
          <input
            className={`form-control text-uppercase ${errors.plate ? "is-invalid" : ""}`}
            value={plate}
            onChange={(e) => setPlate(e.target.value.toUpperCase())}
            placeholder="ABC-1234 ou ABC-1D23"
          />
          {errors.plate ? <div className="invalid-feedback">{errors.plate}</div> : null}
        </div>
        <div className="col-md-4">
          <label className="form-label fw-bold">Modelo</label>
          <input
            className={`form-control text-uppercase ${errors.vehicleModel ? "is-invalid" : ""}`}
            value={vehicleModel}
            onChange={(e) => setVehicleModel(e.target.value.toUpperCase())}
            onBlur={lookupVehicleModel}
          />
          {errors.vehicleModel ? <div className="invalid-feedback">{errors.vehicleModel}</div> : null}
          {vehicleLookupLoading ? (
            <div className="text-muted mt-1" style={{ fontSize: 12 }}>
              Buscando marca...
            </div>
          ) : null}
        </div>
        <div className="col-md-4">
          <label className="form-label fw-bold">Marca</label>
          <input
            className={`form-control text-uppercase ${errors.vehicleBrand ? "is-invalid" : ""}`}
            value={vehicleBrand}
            onChange={(e) => setVehicleBrand(e.target.value.toUpperCase())}
          />
          {errors.vehicleBrand ? <div className="invalid-feedback">{errors.vehicleBrand}</div> : null}
        </div>

        <div className="col-12">
          <hr />
          <h2 className="h5 fw-bold mb-0" style={{ color: "#e63946" }}>
            Cliente e Endereço
          </h2>
        </div>

        <div className="col-md-5">
          <label className="form-label fw-bold">CPF / CNPJ</label>
          <input
            className={`form-control ${errors.customerDoc ? "is-invalid" : ""}`}
            value={customerDoc}
            onChange={(e) => setCustomerDoc(formatCpfCnpj(e.target.value))}
            onBlur={() => {
              setCustomerDoc((v) => formatCpfCnpj(v));
              lookupCustomer();
            }}
            placeholder="CPF ou CNPJ"
          />
          {errors.customerDoc ? <div className="invalid-feedback">{errors.customerDoc}</div> : null}
          {customerLookupLoading ? (
            <div className="text-muted mt-1" style={{ fontSize: 12 }}>
              Buscando cliente...
            </div>
          ) : null}
        </div>
        <div className="col-md-7">
          <label className="form-label fw-bold">Nome</label>
          <input
            className={`form-control text-uppercase ${errors.customerName ? "is-invalid" : ""}`}
            value={customerName}
            onChange={(e) => setCustomerName(e.target.value.toUpperCase())}
          />
          {errors.customerName ? <div className="invalid-feedback">{errors.customerName}</div> : null}
        </div>

        <div className="col-md-3">
          <label className="form-label fw-bold">CEP</label>
          <input
            className={`form-control ${errors.cep ? "is-invalid" : ""}`}
            value={cep}
            readOnly
            onFocus={() => {
              if (!street) setErrors((prev) => ({ ...prev, street: prev.street || "Selecione a rua para preencher o endereço." }));
            }}
            placeholder="00000-000"
          />
          {errors.cep ? <div className="invalid-feedback">{errors.cep}</div> : null}
        </div>
        <div className="col-md-4">
          <label className="form-label fw-bold">Cidade</label>
          <select
            className={`form-select text-uppercase ${errors.city ? "is-invalid" : ""}`}
            value={city}
            onChange={(e) => {
              const v = e.target.value;
              setCity(v);
              setStreet("");
              setStreetQuery("");
              setCep("");
              setDistrict("");
              setStreetResults([]);
              setStreetOpen(false);
            }}
          >
            <option value="">Selecione</option>
            {cities.map((c) => (
              <option key={c} value={c}>
                {c}
              </option>
            ))}
          </select>
          {errors.city ? <div className="invalid-feedback">{errors.city}</div> : null}
        </div>
        <div className="col-md-5 position-relative">
          <label className="form-label fw-bold">Rua / Logradouro</label>
          <input
            className={`form-control text-uppercase ${errors.street ? "is-invalid" : ""}`}
            value={street}
            onChange={(e) => {
              const v = e.target.value.toUpperCase();
              setStreet(v);
              setStreetQuery(v);
              setStreetOpen(true);
              setCep("");
              setDistrict("");
              if (v.trim().length < 3) {
                setStreetResults([]);
                setStreetOpen(false);
              }
            }}
            onFocus={() => {
              if (street.trim().length >= 3) setStreetOpen(true);
            }}
            onBlur={() => {
              setTimeout(() => setStreetOpen(false), 150);
            }}
            placeholder='Ex.: "DOLORES"'
            disabled={!city.trim()}
          />
          {errors.street ? <div className="invalid-feedback">{errors.street}</div> : null}
          {streetOpen && streetResults.length > 0 ? (
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
                  <div className="fw-bold" style={{ color: "#e63946" }}>
                    {r.street}
                  </div>
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
          <input
            className={`form-control text-uppercase ${errors.number ? "is-invalid" : ""}`}
            value={number}
            onChange={(e) => setNumber(e.target.value.toUpperCase())}
          />
          {errors.number ? <div className="invalid-feedback">{errors.number}</div> : null}
        </div>

        <div className="col-md-12">
          <label className="form-label fw-bold">Bairro</label>
          <input
            className={`form-control text-uppercase ${errors.district ? "is-invalid" : ""}`}
            value={district}
            readOnly
          />
          {errors.district ? <div className="invalid-feedback">{errors.district}</div> : null}
        </div>
      </div>

      <button className="btn btn-danger w-100 mt-4" type="submit" disabled={loading || !canSubmit}>
        {loading ? "Salvando..." : "Salvar vistoria"}
      </button>
    </form>
  );
}
