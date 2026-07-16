import { prisma } from "@/lib/db";

const corrections: [string, string][] = [
  ["BYV3E71", "57844957808"],
  ["CTE5J08", "58985218875"],
  ["DXN4874", "98144154800"],
  ["ERM0H53", "44997762873"],
  ["GSG40", "46572661873"],
  ["KYV7768", "34595946830"],
  ["DTH1C45", "02459263309"],
  ["FNZ5B26", "61057529000136"],
];

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

async function main() {
  for (const [plate, newDocRaw] of corrections) {
    const newDoc = newDocRaw.replace(/\D/g, "");
    const valid = newDoc.length === 11 ? isValidCpf(newDoc) : isValidCnpj(newDoc);
    if (!valid) {
      console.log("INVÁLIDO:", plate, newDoc);
      continue;
    }

    const inspection = await prisma.inspection.findFirst({
      where: { vehicle: { plate } },
      include: { vehicle: true, customer: true, job: true },
      orderBy: { date: "desc" },
    });
    if (!inspection) {
      console.log("NAO ENCONTRADO:", plate);
      continue;
    }

    const oldCustomerId = inspection.customer.id;
    const existing = await prisma.customer.findFirst({ where: { doc: newDoc } });

    if (existing) {
      if (existing.id === oldCustomerId) {
        console.log("JA ESTA CORRETO:", plate, newDoc);
      } else {
        console.log("DOC EXISTE EM OUTRO CLIENTE, REASSOCIANDO:", plate, newDoc, existing.name);
        await prisma.inspection.updateMany({
          where: { customerId: oldCustomerId, vehicleId: inspection.vehicleId },
          data: { customerId: existing.id, status: "AGUARDANDO", nfseNumber: null, errorMessage: null },
        });
        const relatedInspections = await prisma.inspection.findMany({
          where: { customerId: existing.id, vehicleId: inspection.vehicleId },
          select: { id: true },
        });
        const ids = relatedInspections.map((x) => x.id);
        if (ids.length > 0) {
          await prisma.invoiceJob.updateMany({
            where: { inspectionId: { in: ids } },
            data: { status: "FILA", lastError: null, attempts: 0 },
          });
        }
      }
    } else {
      await prisma.customer.update({ where: { id: oldCustomerId }, data: { doc: newDoc } });
      await prisma.inspection.updateMany({
        where: { customerId: oldCustomerId },
        data: { status: "AGUARDANDO", nfseNumber: null, errorMessage: null },
      });
      await prisma.invoiceJob.updateMany({
        where: { inspection: { customerId: oldCustomerId } },
        data: { status: "FILA", lastError: null, attempts: 0 },
      });
      console.log("ATUALIZADO:", plate, inspection.customer.doc, "->", newDoc, inspection.customer.name);
    }
  }
}

main()
  .then(() => process.exit(0))
  .catch((e) => {
    console.error(e);
    process.exit(1);
  });
