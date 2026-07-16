import "dotenv/config";
import { parse } from "csv-parse/sync";
import { prisma } from "@/lib/db";

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

function parseDate(v: string) {
  const raw = String(v || "").trim();
  const m = raw.match(/^(\d{2})\/(\d{2})\/(\d{4})/);
  if (m) {
    const [, dd, mm, yyyy] = m;
    return new Date(Number(yyyy), Number(mm) - 1, Number(dd));
  }
  return null;
}

function pick(row: Record<string, string>, keys: string[]) {
  const normalized = row;
  for (const key of keys) {
    const k = normalizeHeader(key);
    if (normalized[k] !== undefined && normalized[k] !== "") {
      return normalized[k];
    }
  }
  return "";
}

async function main() {
  const sheetsCsvUrl = requiredEnv("SHEETS_CSV_URL");
  const targetDate = process.argv[2] || "20/06/2026";

  const res = await fetch(sheetsCsvUrl);
  if (!res.ok) throw new Error(`Falha ao baixar CSV: ${res.status}`);
  const csv = await res.text();

  const rows = parse(csv, { columns: true, skip_empty_lines: true }) as Record<string, string>[];

  const plates: string[] = [];
  const missingInfo: { row: number; plate: string; issues: string[] }[] = [];

  for (let i = 0; i < rows.length; i++) {
    const row = rows[i];
    const dateRaw = pick(row, ["DATA"]);
    const date = parseDate(dateRaw);
    const formattedDate = date
      ? `${String(date.getDate()).padStart(2, "0")}/${String(date.getMonth() + 1).padStart(2, "0")}/${date.getFullYear()}`
      : "";

    if (formattedDate !== targetDate) continue;

    const plate = normalizeText(pick(row, ["PLACA"])).replace(/[^A-Z0-9]/g, "");
    if (!plate) {
      missingInfo.push({ row: i + 2, plate: "SEM PLACA", issues: ["sem placa" + (dateRaw ? ` (data ${dateRaw})` : "")] });
      continue;
    }

    const doc = onlyDigits(pick(row, ["CPF_CNPJ", "CPF/CNPJ", "CPF CNPJ"]));
    const name = normalizeText(pick(row, ["CLIENTE", "NOME", "RAZAO SOCIAL"]));
    const model = normalizeText(pick(row, ["MODELO"]));
    const brand = normalizeText(pick(row, ["MARCA"]));

    const issues: string[] = [];
    if (!doc || doc.length < 11) issues.push("CPF/CNPJ inválido");
    if (!name) issues.push("sem cliente");
    if (!model) issues.push("sem modelo");
    if (!brand) issues.push("sem marca");

    if (issues.length > 0) {
      missingInfo.push({ row: i + 2, plate, issues });
      continue;
    }

    plates.push(plate);
  }

  console.log(`\n=== Placas com data ${targetDate} ===`);
  console.log(`Total de placas válidas na planilha: ${plates.length}`);
  console.log(`Com dados insuficientes: ${missingInfo.length}`);

  if (missingInfo.length > 0) {
    console.log("\n--- Dados insuficientes na planilha ---");
    for (const m of missingInfo) {
      console.log(`Linha ${m.row} | ${m.plate} | ${m.issues.join(", ")}`);
    }
  }

  if (plates.length === 0) return;

  const inspections = await prisma.inspection.findMany({
    where: { vehicle: { plate: { in: plates } } },
    include: { vehicle: true, customer: true, job: true },
    orderBy: { createdAt: "desc" },
  });

  const byPlate = new Map<string, (typeof inspections)[number]>();
  const plateGroups = new Map<string, (typeof inspections)[number][]>();

  for (const insp of inspections) {
    if (!insp.vehicle) continue;
    const plate = insp.vehicle.plate;
    const group = plateGroups.get(plate) || [];
    group.push(insp);
    plateGroups.set(plate, group);
  }

  const duplicates: { plate: string; count: number; statuses: string[] }[] = [];
  for (const [plate, group] of plateGroups.entries()) {
    if (group.length > 1) {
      duplicates.push({
        plate,
        count: group.length,
        statuses: group.map((i) => `${i.status}${i.nfseNumber ? `(NF:${i.nfseNumber})` : ""}`),
      });
    }
    const best =
      group.find((i) => i.status === "LANCADO" && i.nfseNumber) ||
      group.find((i) => i.status === "EMITIDA" && i.nfseNumber) ||
      group[0];
    byPlate.set(plate, best);
  }

  const result = {
    emitida: [] as string[],
    erro: [] as string[],
    processando: [] as string[],
    fila: [] as string[],
    aguardando: [] as string[],
    naoEncontrado: [] as string[],
  };

  for (const plate of plates) {
    const row = byPlate.get(plate);
    if (!row) {
      result.naoEncontrado.push(plate);
      continue;
    }
    const status = row.status;
    const nf = row.nfseNumber || "";
    const job = row.job;
    const line = `${plate} | ${status} | NF: ${nf} | Job: ${job?.status || "sem job"}${row.errorMessage ? " | Erro: " + row.errorMessage.slice(0, 40) : ""}`;

    if (status === "EMITIDA" || status === "LANCADO") result.emitida.push(line);
    else if (status === "ERRO") result.erro.push(line);
    else if (job?.status === "PROCESSANDO") result.processando.push(line);
    else if (job?.status === "FILA") result.fila.push(line);
    else result.aguardando.push(line);
  }

  if (duplicates.length > 0) {
    console.log(`\n=== ATENÇÃO: ${duplicates.length} placas têm inspeções duplicadas ===`);
    for (const d of duplicates) {
      console.log(`${d.plate}: ${d.count} inspeções (${d.statuses.join(", ")})`);
    }
  }

  console.log("\n=== RESUMO DO BANCO ===");
  console.log(`Emitidas/Lançadas: ${result.emitida.length}`);
  console.log(`Erro: ${result.erro.length}`);
  console.log(`Processando: ${result.processando.length}`);
  console.log(`Fila: ${result.fila.length}`);
  console.log(`Aguardando: ${result.aguardando.length}`);
  console.log(`Não encontradas no banco: ${result.naoEncontrado.length}`);

  if (result.emitida.length) console.log(`\n--- Emitidas/Lançadas ---\n${result.emitida.join("\n")}`);
  if (result.erro.length) console.log(`\n--- Erro ---\n${result.erro.join("\n")}`);
  if (result.processando.length) console.log(`\n--- Processando ---\n${result.processando.join("\n")}`);
  if (result.fila.length) console.log(`\n--- Fila ---\n${result.fila.join("\n")}`);
  if (result.aguardando.length) console.log(`\n--- Aguardando ---\n${result.aguardando.join("\n")}`);
  if (result.naoEncontrado.length) console.log(`\n--- Não encontradas no banco ---\n${result.naoEncontrado.join("\n")}`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
