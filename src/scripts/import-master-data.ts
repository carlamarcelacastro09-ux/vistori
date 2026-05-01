import "dotenv/config";
import { parse } from "csv-parse/sync";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "../generated/prisma/client";

type Row = Record<string, string>;

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

function pick(row: Row, name: string) {
  return String(row[normalizeHeader(name)] ?? "");
}

function pickAny(row: Row, names: string[]) {
  for (const n of names) {
    const v = pick(row, n);
    if (String(v || "").trim()) return v;
  }
  return "";
}

function tryExtractSpreadsheetId(url: string) {
  const m = String(url).match(/\/spreadsheets\/d\/([a-zA-Z0-9-_]+)/);
  return m?.[1] ?? null;
}

function gvizCsvUrl(spreadsheetId: string, sheetName: string) {
  return `https://docs.google.com/spreadsheets/d/${spreadsheetId}/gviz/tq?tqx=out:csv&sheet=${encodeURIComponent(sheetName)}`;
}

async function downloadCsv(url: string) {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Falha ao baixar CSV (${res.status})`);
  return await res.text();
}

function parseRows(csv: string): Row[] {
  const raw = parse(csv, { columns: true, skip_empty_lines: true, trim: true }) as Record<string, string>[];
  return raw.map((r) => {
    const out: Row = {};
    Object.keys(r).forEach((k) => {
      out[normalizeHeader(k)] = String(r[k] ?? "");
    });
    return out;
  });
}

async function main() {
  const databaseUrl = requiredEnv("DATABASE_URL");
  const adapter = new PrismaPg({ connectionString: databaseUrl });
  const prisma = new PrismaClient({ adapter });

  const spreadsheetId =
    process.env.SHEETS_SPREADSHEET_ID ??
    (process.env.SHEETS_CSV_URL ? tryExtractSpreadsheetId(process.env.SHEETS_CSV_URL) : null);

  const cepUrl = process.env.SHEETS_CEP_CSV_URL || (spreadsheetId ? gvizCsvUrl(spreadsheetId, "CEP") : "");
  const veiculosUrl = process.env.SHEETS_VEICULOS_CSV_URL || (spreadsheetId ? gvizCsvUrl(spreadsheetId, "VEICULOS") : "");
  const clientesUrl =
    process.env.SHEETS_CLIENTES_CSV_URL || (spreadsheetId ? gvizCsvUrl(spreadsheetId, "CADASTRO_CLIENTE") : "");

  try {
    if (cepUrl) {
      const csv = await downloadCsv(cepUrl);
      const rows = parseRows(csv);
      let upserted = 0;

      for (const row of rows) {
        const street = normalizeText(pickAny(row, ["RUA", "LOGRADOURO"]));
        const district = normalizeText(pick(row, "BAIRRO"));
        const city = normalizeText(pick(row, "CIDADE"));
        const cep = onlyDigits(pick(row, "CEP"));
        if (!street || !district || !city || cep.length !== 8) continue;

        await prisma.street.upsert({
          where: { street_district_city_cep: { street, district, city, cep } },
          create: { street, district, city, cep },
          update: {},
        });
        upserted += 1;
      }

      process.stdout.write(`Ruas importadas/atualizadas: ${upserted}\n`);
    }

    if (veiculosUrl) {
      const csv = await downloadCsv(veiculosUrl);
      const rows = parseRows(csv);
      let upserted = 0;

      for (const row of rows) {
        const model = normalizeText(pick(row, "MODELO"));
        const brand = normalizeText(pick(row, "MARCA"));
        if (!model || !brand) continue;

        await prisma.vehicleCatalog.upsert({
          where: { model },
          create: { model, brand },
          update: { brand },
        });
        upserted += 1;
      }

      process.stdout.write(`Modelos (base) importados: ${upserted}\n`);
    }

    if (clientesUrl) {
      const csv = await downloadCsv(clientesUrl);
      const rows = parseRows(csv);
      let upserted = 0;

      for (const row of rows) {
        const doc = onlyDigits(pickAny(row, ["CPF_CNPJ", "CPF/CNPJ", "CPF", "CNPJ", "DOC"]));
        const name = normalizeText(pickAny(row, ["CLIENTE", "NOME", "RAZAO", "RAZÃO SOCIAL", "RAZAO SOCIAL"]));
        const street = normalizeText(pickAny(row, ["RUA", "LOGRADOURO", "ENDERECO", "ENDEREÇO"]));
        const number = normalizeText(pickAny(row, ["N", "Nº", "N°", "NUMERO", "NÚMERO"]));
        const district = normalizeText(pick(row, "BAIRRO"));
        const city = normalizeText(pick(row, "CIDADE"));
        const cep = onlyDigits(pick(row, "CEP"));
        if ((doc.length !== 11 && doc.length !== 14) || !name) continue;

        await prisma.customer.upsert({
          where: { doc },
          create: { doc, name, street, number, district, city, cep },
          update: { name, street, number, district, city, cep },
        });

        if (street && district && city && cep.length === 8) {
          await prisma.street.upsert({
            where: { street_district_city_cep: { street, district, city, cep } },
            create: { street, district, city, cep },
            update: {},
          });
        }

        upserted += 1;
      }

      process.stdout.write(`Clientes importados/atualizados: ${upserted}\n`);
    }
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((e) => {
  process.stderr.write(String(e) + "\n");
  process.exit(1);
});
