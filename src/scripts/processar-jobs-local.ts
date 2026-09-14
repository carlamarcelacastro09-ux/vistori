import "dotenv/config";
import { readFileSync, existsSync } from "node:fs";
import {
  NfseClient,
  Ambiente,
  TipoAmbienteDps,
  OpcaoSimplesNacional,
  RegimeApuracaoSimplesNacional,
  RegimeEspecialTributacao,
  ReceitaRejectionError,
  createInMemoryDpsCounter,
  createInMemoryRetryStore,
} from "open-nfse";
import { prisma } from "../lib/db";

function requiredEnv(name: string) {
  const v = process.env[name];
  if (!v) throw new Error(`Variável ${name} não configurada.`);
  return v;
}

function envOr(name: string, fallback: string) {
  return process.env[name] || fallback;
}

function onlyDigits(v: string) {
  return String(v || "").replace(/\D/g, "");
}

function parseCompetenceDate(dataCompetencia: string): Date {
  const [dia, mes, ano] = dataCompetencia.split("/").map(Number);
  return new Date(ano, mes - 1, dia);
}

function log(msg: string) {
  process.stdout.write(`[robot-local] ${msg}\n`);
}

function loadCertificate(): { pfx: Buffer; password: string } {
  const pfxPath = process.env.CERT_PFX_PATH;
  const pfxBase64 = process.env.CERT_PFX_BASE64;
  const password = requiredEnv("CERT_PASSWORD");

  if (pfxBase64) return { pfx: Buffer.from(pfxBase64, "base64"), password };
  if (pfxPath) {
    if (existsSync(pfxPath)) return { pfx: readFileSync(pfxPath), password };
    throw new Error(`CERT_PFX_PATH inexistente: ${pfxPath}`);
  }
  throw new Error("Configure CERT_PFX_PATH ou CERT_PFX_BASE64.");
}

async function createNfseClient() {
  const cert = loadCertificate();
  const ambienteStr = envOr("NFSE_AMBIENTE", "producao").toLowerCase();
  const isProducao = ambienteStr === "producao";
  const ambiente = isProducao ? Ambiente.Producao : Ambiente.ProducaoRestrita;

  return {
    client: new NfseClient({
      ambiente,
      certificado: cert,
      dpsCounter: createInMemoryDpsCounter(1),
      retryStore: createInMemoryRetryStore(),
    }),
    tpAmb: isProducao ? TipoAmbienteDps.Producao : TipoAmbienteDps.Homologacao,
  };
}

async function reserveDps(cnpj: string, serie: string): Promise<number> {
  const rows = await prisma.$queryRaw<Array<{ lastNumber: number }>>`
    INSERT INTO "DpsCounter" ("cnpj", "serie", "lastNumber", "updatedAt")
    VALUES (${cnpj}, ${serie}, 1, now())
    ON CONFLICT ("cnpj", "serie")
    DO UPDATE SET "lastNumber" = "DpsCounter"."lastNumber" + 1, "updatedAt" = now()
    RETURNING "lastNumber"
  `;
  return rows[0].lastNumber;
}

async function emitirNota(cliente: NfseClient, tpAmb: TipoAmbienteDps, job: any, nDps: string, useFallbackCep = false): Promise<{ nNFSe: string; nDPS: string }> {
  const docLimpo = onlyDigits(job.customer.doc);
  const cepLimpo = useFallbackCep ? "14850037" : onlyDigits(job.customer.cep);
  if (!docLimpo) throw new Error("Sem documento válido.");

  log(`Emitindo nDPS ${nDps} | ${job.vehicle.plate} | ${job.customer.name.slice(0, 25)}`);

  const cnpjEmitente = onlyDigits(requiredEnv("EMITENTE_CNPJ"));
  const codMunicipio = envOr("EMITENTE_COD_MUNICIPIO", "3540903");
  const inscricaoMunicipal = process.env.EMITENTE_INSCRICAO_MUNICIPAL;
  const serie = envOr("NFSE_SERIE", "1");
  const cTribNac = envOr("NFSE_CODIGO_SERVICO", "010501");
  const cNBS = process.env.NFSE_CNBS || undefined;
  const aliqIss = parseFloat(envOr("NFSE_ALIQ_ISS", "0"));
  const pTotTribSN = parseFloat(envOr("NFSE_PTOTRIBSN", "6.0"));

  const d = job.date as Date;
  const competencia = parseCompetenceDate(`${String(d.getDate()).padStart(2, "0")}/${String(d.getMonth() + 1).padStart(2, "0")}/${d.getFullYear()}`);
  const descricao = `VISTORIA AUTOMOTIVA - ${job.vehicle.model} - ${job.vehicle.plate}`.toUpperCase();

  const tomadorDoc = docLimpo.length <= 11 ? { CPF: docLimpo } : { CNPJ: docLimpo };
  const codMunTomador = process.env.TOMADOR_COD_MUNICIPIO || codMunicipio;
  const dhEmi = new Date(Date.now() - 60_000);

  const r = await cliente.emitir({
    tpAmb,
    dhEmi,
    nDPS: nDps,
    emitente: {
      cnpj: cnpjEmitente,
      codMunicipio,
      inscricaoMunicipal,
      regime: {
        opSimpNac: OpcaoSimplesNacional.MeEpp,
        regApTribSN: RegimeApuracaoSimplesNacional.FederalEMunicipalPeloSN,
        regEspTrib: RegimeEspecialTributacao.Nenhum,
      },
    },
    serie,
    dCompet: competencia,
    servico: { cTribNac, cNBS, descricao, codMunicipioPrestacao: codMunicipio },
    valores: { vServ: Number(job.noteValue), ...(aliqIss > 0 ? { aliqIss } : {}), pTotTribSN },
    tomador: {
      documento: tomadorDoc,
      nome: job.customer.name.toUpperCase(),
      endereco: {
        codMunicipio: codMunTomador,
        cep: cepLimpo,
        logradouro: job.customer.street.toUpperCase(),
        numero: job.customer.number,
        bairro: job.customer.district.toUpperCase(),
      },
    },
    skipCpfCnpjValidation: false,
    skipCepValidation: true,
  });

  if (r.status === "ok") {
    const nNFSe = r.nfse.nfse.infNFSe.nNFSe;
    log(`  SUCESSO nNFSe ${nNFSe} | nDPS ${nDps}`);
    return { nNFSe: String(nNFSe), nDPS: nDps };
  }
  throw new Error(`Emissão pendente: ${r.pending.id}`);
}

async function emitirComAvancoDeSerie(cliente: NfseClient, tpAmb: TipoAmbienteDps, job: any, cnpj: string, serie: string, useFallbackCep = false): Promise<{ nNFSe: string; nDps: string }> {
  for (let tentativa = 1; ; tentativa++) {
    const nDpsNumber = await reserveDps(cnpj, serie);
    const nDps = String(nDpsNumber);
    await prisma.inspection.update({ where: { id: job.id }, data: { nDps } });
    try {
      const { nNFSe, nDPS } = await emitirNota(cliente, tpAmb, job, nDps, useFallbackCep);
      return { nNFSe, nDps: nDPS };
    } catch (e) {
      if (e instanceof ReceitaRejectionError && e.codigo === "E0014" && tentativa < 5) {
        log(`  E0014 nDPS ${nDps}, avançando...`);
        continue;
      }
      throw e;
    }
  }
}

async function main() {
  const { client, tpAmb } = await createNfseClient();
  const cnpj = onlyDigits(requiredEnv("EMITENTE_CNPJ"));
  const serie = envOr("NFSE_SERIE", "1");

  try {
    const jobs = await prisma.invoiceJob.findMany({
      where: { status: { in: ["FILA", "ERRO"] } },
      include: { inspection: { include: { customer: true, vehicle: true } } },
      orderBy: { createdAt: "asc" },
    });

    log(`Jobs pendentes: ${jobs.length}`);

    for (const job of jobs) {
      const insp = job.inspection;
      if (!insp.customer || !insp.vehicle) {
        log(`Job ${job.id} sem cliente/veículo, pulando.`);
        continue;
      }

      let useFallbackCep = false;
      let nNFSe: string | undefined;
      let nDps: string | undefined;

      try {
        ({ nNFSe, nDps } = await emitirComAvancoDeSerie(client, tpAmb, insp, cnpj, serie, useFallbackCep));

        await prisma.$transaction([
          prisma.inspection.update({
            where: { id: insp.id },
            data: { status: "LANCADO", nfseNumber: nDps, nDps, errorMessage: null },
          }),
          prisma.invoiceJob.update({
            where: { id: job.id },
            data: { status: "CONCLUIDO", attempts: { increment: 1 }, lastError: null },
          }),
        ]);
        log(`Concluído: ${insp.vehicle.plate} -> nNFSe ${nNFSe} / nDPS ${nDps}`);
      } catch (e) {
        if (e instanceof ReceitaRejectionError && e.codigo === "E0240" && !useFallbackCep) {
          log(`  CEP inválido, retentando com fallback 14850037...`);
          useFallbackCep = true;
          try {
            ({ nNFSe, nDps } = await emitirComAvancoDeSerie(client, tpAmb, insp, cnpj, serie, useFallbackCep));
            await prisma.$transaction([
              prisma.inspection.update({
                where: { id: insp.id },
                data: { status: "LANCADO", nfseNumber: nDps, nDps, errorMessage: null },
              }),
              prisma.invoiceJob.update({
                where: { id: job.id },
                data: { status: "CONCLUIDO", attempts: { increment: 1 }, lastError: null },
              }),
            ]);
            log(`Concluído (CEP fallback): ${insp.vehicle.plate} -> nNFSe ${nNFSe} / nDPS ${nDps}`);
            continue;
          } catch (e2) {
            // cai pro tratamento de erro abaixo
          }
        }

        const msg = e instanceof Error ? e.message : String(e);
        await prisma.$transaction([
          prisma.inspection.update({
            where: { id: insp.id },
            data: { status: "ERRO", errorMessage: msg.slice(0, 500) },
          }),
          prisma.invoiceJob.update({
            where: { id: job.id },
            data: { status: "ERRO", attempts: { increment: 1 }, lastError: msg.slice(0, 500) },
          }),
        ]);
        log(`Erro: ${msg.slice(0, 200)}`);
      }
    }
  } finally {
    await client.close().catch(() => {});
    await prisma.$disconnect();
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
