import "dotenv/config";
import { parse } from "csv-parse/sync";

type SheetRow = Record<string, string>;

function requiredEnv(name: string) {
  const v = process.env[name];
  if (!v) throw new Error(`Variável ${name} não configurada.`);
  return v;
}

function normalizeHeader(v: string) {
  return String(v || "").trim().toUpperCase();
}

function onlyDigits(v: string) {
  return String(v || "").replace(/\D/g, "");
}

function normalizeText(v: string) {
  return String(v || "").trim().replace(/\s+/g, " ").toUpperCase();
}

function parseMoney(v: string) {
  const s = String(v || "").trim();
  if (!s) return 0;
  const cleaned = s.replace(/[^\d,.-]/g, "").replace(/\./g, "").replace(",", ".");
  const n = Number(cleaned);
  return Number.isFinite(n) ? n : 0;
}

function pick(row: SheetRow, names: string[]) {
  for (const n of names) {
    const key = normalizeHeader(n);
    if (row[key] !== undefined) return String(row[key] ?? "");
  }
  return "";
}

function missingFields(row: SheetRow) {
  const plate = normalizeText(pick(row, ["PLACA"])).replace(/[^A-Z0-9]/g, "");
  const customerDoc = onlyDigits(pick(row, ["CPF_CNPJ", "CPF/CNPJ", "CPF CNPJ", "CPF"]));
  const customerName = normalizeText(pick(row, ["CLIENTE", "NOME", "RAZAO SOCIAL", "RAZÃO SOCIAL"]));
  const street = normalizeText(pick(row, ["RUA", "LOGRADOURO"]));
  const number = normalizeText(pick(row, ["NÂº", "Nº", "N", "NUMERO", "NÚMERO"]));
  const district = normalizeText(pick(row, ["BAIRRO"]));
  const city = normalizeText(pick(row, ["CIDADE"]));
  const cep = onlyDigits(pick(row, ["CEP"]));
  const vehicleModel = normalizeText(pick(row, ["MODELO"]));
  const vehicleBrand = normalizeText(pick(row, ["MARCA"]));
  const paidValue = parseMoney(pick(row, ["PREÃO", "PRECO", "PREÇO", "VALOR_PAGO", "VALOR PAGO", "VALOR"]));

  const missing: string[] = [];
  if (!plate) missing.push("PLACA");
  if (!(customerDoc.length === 11 || customerDoc.length === 14)) missing.push("CPF/CNPJ");
  if (!customerName) missing.push("CLIENTE");
  if (!street) missing.push("RUA/LOGRADOURO");
  if (!number) missing.push("Nº");
  if (!district) missing.push("BAIRRO");
  if (!city) missing.push("CIDADE");
  if (cep.length !== 8) missing.push("CEP");
  if (!vehicleModel) missing.push("MODELO");
  if (!vehicleBrand) missing.push("MARCA");
  if (!(paidValue > 0)) missing.push("VALOR");

  return { plate, customerDoc, customerName, missing };
}

async function main() {
  const sheetsCsvUrl = requiredEnv("SHEETS_CSV_URL");
  const res = await fetch(sheetsCsvUrl);
  if (!res.ok) throw new Error(`Falha ao baixar CSV: ${res.status}`);
  const csv = await res.text();

  const rawRows = parse(csv, {
    columns: true,
    skip_empty_lines: true,
    trim: true,
  }) as Record<string, string>[];

  const rows: SheetRow[] = rawRows.map((r) => {
    const normalized: SheetRow = {};
    Object.keys(r).forEach((k) => {
      normalized[normalizeHeader(k)] = String(r[k] ?? "");
    });
    return normalized;
  });

  const issues: Array<{ idx: number; plate: string; doc: string; name: string; missing: string[] }> = [];

  for (let i = 0; i < rows.length; i++) {
    const r = rows[i];
    const m = missingFields(r);
    if (m.missing.length > 0) {
      issues.push({ idx: i + 2, plate: m.plate, doc: m.customerDoc, name: m.customerName, missing: m.missing });
    }
  }

  process.stdout.write(`Linhas com dados faltando (ATENDIMENTO): ${issues.length}\n`);
  for (const it of issues.slice(0, 50)) {
    process.stdout.write(
      `Linha ${it.idx} | PLACA ${it.plate || "-"} | DOC ${it.doc || "-"} | CLIENTE ${it.name || "-"} | FALTA: ${it.missing.join(", ")}\n`,
    );
  }
  if (issues.length > 50) {
    process.stdout.write(`... (mostrando 50 de ${issues.length})\n`);
  }
}

main().catch((e) => {
  process.stderr.write(String(e) + "\n");
  process.exit(1);
});
