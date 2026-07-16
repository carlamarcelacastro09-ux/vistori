import "dotenv/config";
import fs from "node:fs";
import { parse } from "csv-parse/sync";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "../generated/prisma/client";

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

function parseDate(v: string) {
  const raw = String(v || "").trim();
  const m = raw.match(/^(\d{2})\/(\d{2})\/(\d{4})/);
  if (m) {
    const [, dd, mm, yyyy] = m;
    return new Date(Number(yyyy), Number(mm) - 1, Number(dd));
  }
  const iso = new Date(raw);
  if (!Number.isNaN(iso.getTime())) return iso;
  return new Date();
}

function pick(row: SheetRow, names: string[]) {
  for (const n of names) {
    const key = normalizeHeader(n);
    if (row[key] !== undefined) return String(row[key] ?? "");
  }
  return "";
}

function statusToInvoiceStatus(statusRaw: string, noteNumber: string): "AGUARDANDO" | "LANCADO" | "ERRO" {
  const n = normalizeText(noteNumber);
  if (/\d+/.test(n)) return "LANCADO";

  const s = normalizeText(statusRaw);
  if (s.includes("ERRO")) return "ERRO";
  return "AGUARDANDO";
}

async function main() {
  const databaseUrl = requiredEnv("DATABASE_URL");
  const sheetsCsvUrl = requiredEnv("SHEETS_CSV_URL");
  const importUserEmail = (process.env.IMPORT_USER_EMAIL || "admin@pissarro.local").toLowerCase();

  const adapter = new PrismaPg({ connectionString: databaseUrl });
  const prisma = new PrismaClient({ adapter });

  try {
    const user = await prisma.user.findUnique({ where: { email: importUserEmail } });
    if (!user) {
      throw new Error(`Usuário ${importUserEmail} não encontrado. Rode o seed antes.`);
    }

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

    let imported = 0;
    let skipped = 0;
    let duplicated = 0;
    let updated = 0;
    let errors = 0;
    const skippedRows: { row: number; plate: string; reasons: string[] }[] = [];

    for (let idx = 0; idx < rows.length; idx++) {
      const row = rows[idx];
      const plate = normalizeText(pick(row, ["PLACA"])).replace(/[^A-Z0-9]/g, "");
      const customerDoc = onlyDigits(pick(row, ["CPF_CNPJ", "CPF/CNPJ", "CPF CNPJ"]));
      const customerName = normalizeText(pick(row, ["CLIENTE", "NOME", "RAZAO SOCIAL"]));
      const street = normalizeText(pick(row, ["RUA", "LOGRADOURO"]));
      const number = normalizeText(pick(row, ["NÂº", "Nº", "N", "NUMERO", "NÚMERO"]));
      const district = normalizeText(pick(row, ["BAIRRO"]));
      const city = normalizeText(pick(row, ["CIDADE"]));
      const cep = onlyDigits(pick(row, ["CEP"]));
      const vehicleModel = normalizeText(pick(row, ["MODELO"]));
      const vehicleBrand = normalizeText(pick(row, ["MARCA"]));
      const paidValue = parseMoney(pick(row, ["PREÃO", "PRECO", "PREÇO", "VALOR_PAGO", "VALOR PAGO", "VALOR"]));
      const noteNumber = normalizeText(pick(row, ["NOTA FISCAL", "NFS", "N_NOTA", "NOTA", "Nº NOTA"]));
      const statusRaw = pick(row, ["STATUS"]);
      const date = parseDate(pick(row, ["DATA"]));

      const targetDate = parseDate("20/06/2026");
      const isTargetDateOrLater = date && targetDate && date.getTime() >= targetDate.getTime();
      if (!isTargetDateOrLater) continue;

      const reasons: string[] = [];
      if (!plate) reasons.push("sem placa");
      if (!customerDoc) reasons.push("sem CPF/CNPJ");
      if (customerDoc && customerDoc.length < 11) reasons.push("CPF/CNPJ muito curto");
      if (!customerName) reasons.push("sem cliente");
      if (!street) reasons.push("sem rua");
      if (!number) reasons.push("sem número");
      if (!district) reasons.push("sem bairro");
      if (!city) reasons.push("sem cidade");
      if (cep.length !== 8) reasons.push("CEP inválido");
      if (!vehicleModel) reasons.push("sem modelo");
      if (!vehicleBrand) reasons.push("sem marca");
      if (paidValue <= 0) reasons.push("valor pago inválido");

      if (reasons.length > 0) {
        skipped += 1;
        skippedRows.push({ row: idx + 1, plate: plate || "SEM PLACA", reasons });
        continue;
      }

      try {
        const customer = await prisma.customer.upsert({
          where: { doc: customerDoc },
          create: {
            doc: customerDoc,
            name: customerName,
            street,
            number,
            district,
            city,
            cep,
          },
          update: {
            name: customerName,
            street,
            number,
            district,
            city,
            cep,
          },
        });

        await prisma.street.upsert({
          where: {
            street_district_city_cep: {
              street,
              district,
              city,
              cep,
            },
          },
          create: {
            street,
            district,
            city,
            cep,
          },
          update: {},
        });

        const vehicle = await prisma.vehicle.upsert({
          where: { plate },
          create: {
            plate,
            model: vehicleModel,
            brand: vehicleBrand,
          },
          update: {
            model: vehicleModel,
            brand: vehicleBrand,
          },
        });

        await prisma.vehicleCatalog.upsert({
          where: { model: vehicleModel },
          create: { model: vehicleModel, brand: vehicleBrand },
          update: { brand: vehicleBrand },
        });

        const invoiceStatus = statusToInvoiceStatus(statusRaw, noteNumber);
        const paidValueStr = paidValue.toFixed(2);

        const start = new Date(date.getFullYear(), date.getMonth(), date.getDate() - 1);
        const end = new Date(date.getFullYear(), date.getMonth(), date.getDate() + 2);

        const exists = await prisma.inspection.findFirst({
          where: {
            date: { gte: start, lt: end },
            vehicle: { plate },
          },
          orderBy: { createdAt: "desc" },
          select: { id: true, status: true, nfseNumber: true, date: true, paidValue: true },
        });

        if (exists) {
          const shouldBeEmitted = invoiceStatus === "LANCADO";
          const hasNote = /\d+/.test(normalizeText(noteNumber));
          const wasEmittedWithoutNote = (exists.status === "EMITIDA" || exists.status === "LANCADO") && !exists.nfseNumber;

          if (shouldBeEmitted && hasNote && exists.nfseNumber !== normalizeText(noteNumber)) {
            await prisma.inspection.update({
              where: { id: exists.id },
              data: { status: "LANCADO", nfseNumber: normalizeText(noteNumber), errorMessage: null },
            });
            await prisma.invoiceJob.updateMany({
              where: { inspectionId: exists.id },
              data: { status: "CONCLUIDO", lastError: null },
            });
            updated += 1;
          } else if (!shouldBeEmitted && wasEmittedWithoutNote) {
            await prisma.inspection.update({
              where: { id: exists.id },
              data: { status: invoiceStatus, nfseNumber: null },
            });
            await prisma.invoiceJob.updateMany({
              where: { inspectionId: exists.id },
              data: { status: invoiceStatus === "ERRO" ? "ERRO" : "FILA", lastError: invoiceStatus === "ERRO" ? "Importado da planilha com status ERRO" : null },
            });
            updated += 1;
          }

          duplicated += 1;
          continue;
        }

        await prisma.inspection.create({
          data: {
            date,
            paidValue: paidValueStr,
            noteValue: "25.00",
            status: invoiceStatus,
            nfseNumber: noteNumber || null,
            customerId: customer.id,
            vehicleId: vehicle.id,
            createdById: user.id,
            job: {
              create: {
                status: invoiceStatus === "LANCADO" ? "CONCLUIDO" : invoiceStatus === "ERRO" ? "ERRO" : "FILA",
                lastError: invoiceStatus === "ERRO" ? "Importado da planilha com status ERRO" : null,
              },
            },
          },
        });

        imported += 1;
      } catch (e) {
        errors += 1;
      } finally {
        if ((idx + 1) % 25 === 0) {
          process.stdout.write(
            `Processadas ${idx + 1}/${rows.length} | Importadas ${imported} | Atualizadas ${updated} | Duplicadas ${duplicated} | Ignoradas ${skipped} | Erros ${errors}\n`,
          );
        }
      }
    }

    process.stdout.write(
      `Importação concluída. Importadas: ${imported}. Atualizadas: ${updated}. Duplicadas: ${duplicated}. Ignoradas: ${skipped}. Erros: ${errors}.\n`,
    );

    if (skippedRows.length > 0) {
      const lines = skippedRows.map((s) => `Linha ${s.row} | Placa: ${s.plate} | ${s.reasons.join(", ")}`);
      const report = `--- Linhas ignoradas ---\n${lines.join("\n")}\n`;
      process.stdout.write(`\n${report}`);
      await fs.promises.writeFile("import-ignoradas.txt", report, "utf-8");
    }
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((e) => {
  process.stderr.write(String(e) + "\n");
  process.exit(1);
});
