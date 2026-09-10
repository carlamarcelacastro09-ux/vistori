import "dotenv/config";
import { prisma } from "../lib/db";
import { readFileSync } from "fs";

const apply = process.argv.includes("--apply");

interface Divergencia {
  nfseNumber: string;
  problema: string;
  emissor: string;
  banco: string;
}

interface NotaEmissor {
  nfseNumber: string;
  nDps: string;
  data: string;
  cpf: string;
  nome: string;
  placa: string;
  modelo: string;
  chave: string;
}

async function main() {
  const divPath = "divergencias-notas.csv";
  const notasPath = "notas-emissor-todas.json";

  const divergencias: Divergencia[] = parseCsv(readFileSync(divPath, "utf-8"));
  const notasRaw: any[] = JSON.parse(readFileSync(notasPath, "utf-8"));

  // Normaliza nNFSe e placa
  const notas: NotaEmissor[] = notasRaw.map((n) => ({
    ...n,
    nfseNumber: n.nfseNumber || (n.chave && n.chave.length >= 23 ? String(parseInt(n.chave.slice(-23, -14), 10)) : ""),
    placa: (n.placa || "").toUpperCase().replace(/-/g, ""),
  }));

  const notasByNfse = new Map<string, NotaEmissor>();
  for (const n of notas) {
    if (n.nfseNumber) notasByNfse.set(n.nfseNumber, n);
  }

  let corrigidas = 0;
  let inseridas = 0;

  // 1. Corrigir placas
  for (const d of divergencias) {
    if (d.problema !== "PLACA_DIFERENTE") continue;
    const nota = notasByNfse.get(d.nfseNumber);
    if (!nota) {
      console.log(`Nota ${d.nfseNumber} não encontrada no emissor, pulando.`);
      continue;
    }
    if (!nota.placa) {
      console.log(`Nota ${d.nfseNumber} sem placa no emissor, pulando.`);
      continue;
    }

    const inspection = await prisma.inspection.findFirst({
      where: { nfseNumber: d.nfseNumber },
      include: { customer: true, vehicle: true },
    });
    if (!inspection) {
      console.log(`Nota ${d.nfseNumber} não encontrada no banco, pulando.`);
      continue;
    }

    const placaCorreta = nota.placa;

    if (apply) {
      let vehicle = await prisma.vehicle.findFirst({ where: { plate: placaCorreta } });
      if (!vehicle) {
        vehicle = await prisma.vehicle.create({
          data: { plate: placaCorreta, brand: "", model: nota.modelo || "" },
        });
        console.log(`  Veículo criado: ${placaCorreta}`);
      }

      await prisma.inspection.update({
        where: { id: inspection.id },
        data: { vehicleId: vehicle.id, nDps: nota.nDps },
      });
      if (inspection.vehicle && inspection.vehicle.plate !== placaCorreta) {
        // mantém o veículo antigo, só desvincula
      }
    } else {
      console.log(`[DRY-RUN] Corrigir nota ${d.nfseNumber}: placa banco ${inspection.vehicle?.plate} -> ${placaCorreta} | CPF ${inspection.customer?.doc}`);
    }
    corrigidas++;
  }

  // 2. Inserir notas faltantes
  const faltantes = divergencias.filter((d) => d.problema === "NOTA_NO_EMISSOR_NAO_ENCONTRADA_NO_BANCO");

  // Busca usuário padrão e customer/vehicle já existentes
  const defaultUser = await prisma.user.findFirst();
  if (!defaultUser) {
    console.log("Nenhum usuário encontrado. Não é possível inserir notas sem createdBy.");
    return;
  }

  for (const d of faltantes) {
    const nota = notasByNfse.get(d.nfseNumber);
    if (!nota) continue;
    if (!nota.cpf) continue;

    if (apply) {
      const customer = await prisma.customer.upsert({
        where: { doc: nota.cpf },
        create: { doc: nota.cpf, name: nota.nome || "DESCONHECIDO", street: "", number: "", district: "", city: "", cep: "" },
        update: {},
      });

      let vehicle = null;
      if (nota.placa) {
        vehicle = await prisma.vehicle.findFirst({ where: { plate: nota.placa } });
        if (!vehicle) {
          vehicle = await prisma.vehicle.create({
            data: { plate: nota.placa, brand: "", model: nota.modelo || "" },
          });
        }
      }

      const [dia, mes, ano] = nota.data.split("/");
      const date = new Date(`${ano}-${mes}-${dia}T12:00:00.000Z`);

      await prisma.inspection.create({
        data: {
          date,
          paidValue: 25,
          noteValue: 25,
          status: "LANCADO",
          nfseNumber: nota.nfseNumber,
          nDps: nota.nDps,
          customerId: customer.id,
          vehicleId: vehicle?.id || null,
          createdById: defaultUser.id,
        },
      });
      console.log(`  Inserida nota ${nota.nfseNumber} | CPF ${nota.cpf} | placa ${nota.placa}`);
    } else {
      console.log(`[DRY-RUN] Inserir nota faltante ${nota.nfseNumber} | ${nota.data} | ${nota.cpf} | ${nota.placa} | ${nota.nome}`);
    }
    inseridas++;
  }

  console.log(`\n${apply ? "Aplicado" : "Dry-run"}: ${corrigidas} placas corrigidas, ${inseridas} notas inseridas.`);
}

function parseCsv(text: string): Divergencia[] {
  const lines = text.replace("\r\n", "\n").split("\n").filter(Boolean);
  const headers = lines[0].split(",");
  return lines.slice(1).map((line) => {
    // Parser simples não lida com vírgulas em campos, mas nosso CSV tem aspas
    const obj: any = {};
    let current = "";
    let inQuotes = false;
    let col = 0;
    for (let i = 0; i < line.length; i++) {
      const c = line[i];
      if (c === '"') {
        inQuotes = !inQuotes;
      } else if (c === "," && !inQuotes) {
        obj[headers[col]] = current;
        current = "";
        col++;
      } else {
        current += c;
      }
    }
    obj[headers[col]] = current;
    return obj as Divergencia;
  });
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
