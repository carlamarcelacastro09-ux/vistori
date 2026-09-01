/**
 * Robô de Conferência NFSe
 * 
 * Consulta cada DPS enviada (pelo nDPS) na SEFIN via fetchDpsStatus,
 * extrai o número da NFSe e a descrição do serviço (que contém CPF + placa),
 * e cruza com as inspeções no banco para associar o nfseNumber correto.
 * 
 * Uso: NFSE_LAST_DPS=6307 npx tsx src/robot/conferencia.ts
 */
import "dotenv/config";
import { readFileSync } from "fs";
import {
  NfseClient,
  Ambiente,
  createInMemoryDpsCounter,
  createInMemoryRetryStore,
  buildDpsId,
} from "open-nfse";
import { prisma } from "../lib/db";

function requiredEnv(name: string): string {
  const val = process.env[name];
  if (!val) throw new Error(`Env ${name} obrigatória`);
  return val;
}

function envOr(name: string, fallback: string): string {
  return process.env[name] || fallback;
}

function onlyDigits(s: string): string {
  return s.replace(/\D/g, "");
}

function log(msg: string) {
  process.stdout.write(`[conferencia] ${msg}\n`);
}

function loadCertificate(): { pfx: Buffer; password: string } {
  const pfxPath = process.env.CERT_PFX_PATH;
  const pfxBase64 = process.env.CERT_PFX_BASE64;
  const password = requiredEnv("CERT_PASSWORD");
  if (pfxPath) return { pfx: readFileSync(pfxPath), password };
  if (pfxBase64) return { pfx: Buffer.from(pfxBase64, "base64"), password };
  throw new Error("Configure CERT_PFX_PATH ou CERT_PFX_BASE64.");
}

async function main() {
  const cert = loadCertificate();
  const ambienteStr = envOr("NFSE_AMBIENTE", "producao").toLowerCase();
  const isProducao = ambienteStr === "producao";
  const ambiente = isProducao ? Ambiente.Producao : Ambiente.ProducaoRestrita;
  const cnpjEmitente = onlyDigits(requiredEnv("EMITENTE_CNPJ"));
  const serie = envOr("NFSE_SERIE", "1");
  const codMunicipio = envOr("EMITENTE_COD_MUNICIPIO", "3540903");

  const client = new NfseClient({
    ambiente,
    certificado: cert,
    dpsCounter: createInMemoryDpsCounter(1),
    retryStore: createInMemoryRetryStore(),
  });

  // 1. Buscar inspeções com E0014 (nota existe na SEFIN mas não gravada no banco)
  const erros = await prisma.inspection.findMany({
    where: {
      status: "ERRO",
      errorMessage: { contains: "E0014" },
    },
    include: { customer: true, vehicle: true },
  });

  log(`Inspeções E0014: ${erros.length}`);

  if (erros.length === 0) {
    log("Nenhum E0014 para conferir.");
    await client.close();
    return;
  }

  // 2. Para cada nDPS possível (6265-6307 da sessão 1), consultar status na SEFIN
  const startDps = 6265;
  const endDps = 6307;
  
  const dpsResults: Array<{
    nDps: number;
    nfseNumber: string;
    descricao: string;
    cpf: string;
    plate: string;
  }> = [];

  for (let nDps = startDps; nDps <= endDps; nDps++) {
    const dpsId = buildDpsId({
      cLocEmi: codMunicipio,
      tipoInsc: "CNPJ",
      inscricaoFederal: cnpjEmitente,
      serie,
      nDPS: String(nDps),
    });

    try {
      log(`Consultando nDPS ${nDps} (id: ${dpsId})...`);
      const status = await client.fetchDpsStatus(dpsId);

      if (status && (status as any).nfse) {
        const nfse = (status as any).nfse;
        const infNfse = nfse.infNFSe || nfse;
        const nNFSe = infNfse.nNFSe || "";
        const descricao = infNfse?.serv?.desc || infNfse?.DPS?.serv?.desc || "";
        const cpfTomador =
          infNfse?.toma?.CPF ||
          infNfse?.toma?.CNPJ ||
          infNfse?.DPS?.toma?.CPF ||
          infNfse?.DPS?.toma?.CNPJ ||
          "";

        // Extrair placa da descrição (formato: "VISTORIA AUTOMOTIVA - MODELO - PLACA")
        const descStr = String(descricao);
        const parts = descStr.split(" - ");
        const plate = parts.length >= 3 ? parts[parts.length - 1].trim() : "";

        log(`  nDPS ${nDps} -> NFSe ${nNFSe} | CPF: ${cpfTomador} | Placa: ${plate} | Desc: ${descStr.slice(0, 60)}`);

        dpsResults.push({
          nDps,
          nfseNumber: String(nNFSe),
          descricao: descStr,
          cpf: onlyDigits(cpfTomador),
          plate,
        });
      } else {
        log(`  nDPS ${nDps} -> sem NFSe associada`);
      }

      // Rate limiting - esperar 500ms entre consultas
      await new Promise((r) => setTimeout(r, 500));
    } catch (e: any) {
      log(`  nDPS ${nDps} -> erro: ${e.message?.slice(0, 80)}`);
      await new Promise((r) => setTimeout(r, 1000));
    }
  }

  log(`\nResultados SEFIN: ${dpsResults.length} NFSe encontradas`);

  // 3. Cruzar com inspeções E0014 por CPF + placa
  let matched = 0;
  let unmatched = 0;

  for (const err of erros) {
    const cpf = onlyDigits(err.customer?.doc || "");
    const plate = err.vehicle?.plate || "";

    const match = dpsResults.find(
      (d) => d.cpf === cpf && d.plate.toUpperCase() === plate.toUpperCase()
    );

    if (match) {
      log(`MATCH: ${plate} | ${err.customer?.name} -> NFSe ${match.nfseNumber} (nDPS ${match.nDps})`);

      // Atualizar no banco
      await prisma.inspection.update({
        where: { id: err.id },
        data: {
          status: "LANCADO",
          nfseNumber: match.nfseNumber,
          errorMessage: null,
        },
      });

      // Atualizar job
      await prisma.invoiceJob.updateMany({
        where: { inspectionId: err.id },
        data: { status: "CONCLUIDO", lastError: null },
      });

      matched++;
    } else {
      log(`SEM MATCH: ${plate} | ${err.customer?.name} | CPF: ${cpf}`);
      unmatched++;
    }
  }

  log(`\n=== RESULTADO ===`);
  log(`Matched: ${matched}`);
  log(`Sem match: ${unmatched}`);

  await client.close();
}

main()
  .catch((e) => {
    console.error("Erro:", e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
