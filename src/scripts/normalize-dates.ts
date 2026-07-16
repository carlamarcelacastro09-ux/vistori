import "dotenv/config";
import { parse } from "csv-parse/sync";
import { prisma } from "@/lib/db";

function normalizeHeader(v: string) {
  return String(v || "").trim().toUpperCase();
}

function normalizeText(v: string) {
  return String(v || "").trim().replace(/\s+/g, " ").toUpperCase();
}

function pick(row: Record<string, string>, keys: string[]) {
  for (const key of keys) {
    const k = normalizeHeader(key);
    if (row[k] !== undefined && row[k] !== "") return row[k];
  }
  return "";
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

async function main() {
  const sheetsCsvUrl = process.env.SHEETS_CSV_URL;
  if (!sheetsCsvUrl) throw new Error("SHEETS_CSV_URL não configurada.");
  const targetDate = process.argv[2] || "20/06/2026";

  const res = await fetch(sheetsCsvUrl);
  if (!res.ok) throw new Error(`Falha ao baixar CSV: ${res.status}`);
  const csv = await res.text();
  const rows = parse(csv, { columns: true, skip_empty_lines: true }) as Record<string, string>[];

  const plates: string[] = [];
  for (const row of rows) {
    const dateRaw = pick(row, ["DATA"]);
    const date = parseDate(dateRaw);
    const formatted = date
      ? `${String(date.getDate()).padStart(2, "0")}/${String(date.getMonth() + 1).padStart(2, "0")}/${date.getFullYear()}`
      : "";
    if (formatted !== targetDate) continue;
    const plate = normalizeText(pick(row, ["PLACA"])).replace(/[^A-Z0-9]/g, "");
    if (plate) plates.push(plate);
  }

  const targetDateObj = parseDate(targetDate);
  if (!targetDateObj) throw new Error("Data alvo inválida.");

  let updated = 0;
  let deleted = 0;

  for (const plate of plates) {
    const inspections = await prisma.inspection.findMany({
      where: { vehicle: { plate } },
      include: { vehicle: true, job: true },
      orderBy: { createdAt: "desc" },
    });
    if (inspections.length === 0) continue;

    const best =
      inspections.find((i) => i.status === "LANCADO") ||
      inspections.find((i) => i.status === "EMITIDA") ||
      inspections[0];

    const others = inspections.filter((i) => i.id !== best.id).map((i) => i.id);

    if (others.length > 0) {
      await prisma.invoiceJob.deleteMany({ where: { inspectionId: { in: others } } });
      await prisma.inspection.deleteMany({ where: { id: { in: others } } });
      deleted += others.length;
    }

    if (best.date.toISOString() !== targetDateObj.toISOString()) {
      await prisma.inspection.update({
        where: { id: best.id },
        data: { date: targetDateObj },
      });
      updated += 1;
    }
  }

  console.log(`Placas processadas: ${plates.length}`);
  console.log(`Datas normalizadas: ${updated}`);
  console.log(`Inspeções duplicadas removidas: ${deleted}`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
