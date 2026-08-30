import "dotenv/config";
import { readFileSync } from "node:fs";
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

type NextJobResponse =
  | { ok: true; job: null }
  | {
      ok: true;
      job: {
        jobId: string;
        competenceDate: string;
        paidValue: number;
        noteValue: number;
        plate: string;
        vehicleBrand: string;
        vehicleModel: string;
        customerDoc: string;
        customerName: string;
        cep: string;
        street: string;
        number: string;
        district: string;
        city: string;
        lastNfseNumber: string | null;
      };
    };

type NextJobWithJob = Extract<NextJobResponse, { ok: true; job: { jobId: string } }>;
type Job = NextJobWithJob["job"];

function requiredEnv(name: string) {
  const v = process.env[name];
  if (!v) throw new Error(`Variável ${name} não configurada.`);
  return v;
}

function envOr(name: string, fallback: string) {
  return process.env[name] || fallback;
}

function sleep(ms: number) {
  return new Promise((r) => setTimeout(r, ms));
}

function onlyDigits(v: string) {
  return String(v || "").replace(/\D/g, "");
}

function parseCompetenceDate(dataCompetencia: string): Date {
  const [dia, mes, ano] = dataCompetencia.split("/").map(Number);
  return new Date(ano, mes - 1, dia);
}

function log(msg: string) {
  process.stdout.write(`[robot] ${msg}\n`);
}

function loadCertificate(): { pfx: Buffer; password: string } {
  const pfxPath = process.env.CERT_PFX_PATH;
  const pfxBase64 = process.env.CERT_PFX_BASE64;
  const password = requiredEnv("CERT_PASSWORD");

  if (pfxPath) {
    return { pfx: readFileSync(pfxPath), password };
  }
  if (pfxBase64) {
    return { pfx: Buffer.from(pfxBase64, "base64"), password };
  }
  throw new Error("Configure CERT_PFX_PATH (caminho do .pfx) ou CERT_PFX_BASE64 (conteúdo em base64).");
}

function createNfseClient() {
  const cert = loadCertificate();
  const ambienteStr = envOr("NFSE_AMBIENTE", "producao").toLowerCase();
  const isProducao = ambienteStr === "producao";
  const ambiente = isProducao ? Ambiente.Producao : Ambiente.ProducaoRestrita;

  return {
    client: new NfseClient({
      ambiente,
      certificado: cert,
      dpsCounter: createInMemoryDpsCounter(),
      retryStore: createInMemoryRetryStore(),
    }),
    tpAmb: isProducao ? TipoAmbienteDps.Producao : TipoAmbienteDps.Homologacao,
  };
}

async function emitirNota(cliente: NfseClient, tpAmb: TipoAmbienteDps, job: Job): Promise<string> {
  const docLimpo = onlyDigits(job.customerDoc);
  const cepLimpo = onlyDigits(job.cep);

  if (!docLimpo) throw new Error("Sem documento válido (CPF/CNPJ).");

  log(`Processando: ${job.plate} | Cliente: ${job.customerName.slice(0, 25)} | Competência: ${job.competenceDate}...`);

  const cnpjEmitente = onlyDigits(requiredEnv("EMITENTE_CNPJ"));
  const codMunicipio = envOr("EMITENTE_COD_MUNICIPIO", "3540903");
  const inscricaoMunicipal = process.env.EMITENTE_INSCRICAO_MUNICIPAL;
  const serie = envOr("NFSE_SERIE", "1");
  const cTribNac = envOr("NFSE_CODIGO_SERVICO", "010501");
  const cNBS = process.env.NFSE_CNBS || undefined;
  const aliqIss = parseFloat(envOr("NFSE_ALIQ_ISS", "0"));
  const pTotTribSN = parseFloat(envOr("NFSE_PTOTTRIBSN", "6.0"));

  const competencia = parseCompetenceDate(job.competenceDate);
  const descricao = `VISTORIA AUTOMOTIVA - ${job.vehicleModel} - ${job.plate}`.toUpperCase();

  const tomadorDoc = docLimpo.length <= 11
    ? { CPF: docLimpo }
    : { CNPJ: docLimpo };

  const codMunTomador = process.env.TOMADOR_COD_MUNICIPIO || codMunicipio;

  // dhEmi ligeiramente no passado para evitar E0008 (clock skew com SEFIN)
  const dhEmi = new Date(Date.now() - 60_000);

  const r = await cliente.emitir({
    tpAmb,
    dhEmi,
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
    servico: {
      cTribNac,
      cNBS,
      descricao,
      codMunicipioPrestacao: codMunicipio,
    },
    valores: {
      vServ: job.noteValue,
      ...(aliqIss > 0 ? { aliqIss } : {}),
      pTotTribSN,
    },
    tomador: {
      documento: tomadorDoc,
      nome: job.customerName.toUpperCase(),
      endereco: {
        codMunicipio: codMunTomador,
        cep: cepLimpo,
        logradouro: job.street.toUpperCase(),
        numero: job.number,
        bairro: job.district.toUpperCase(),
      },
    },
    skipCpfCnpjValidation: false,
    skipCepValidation: true,
  });

  if (r.status === "ok") {
    const chave = r.nfse.chaveAcesso;
    const nNFSe = r.nfse.nfse.infNFSe.nNFSe;
    log(`SUCESSO: NFS-e emitida! Chave: ${chave} | Número: ${nNFSe}`);
    return String(nNFSe);
  }

  // retry_pending — transiente, a lib salvou no store
  log(`Emissão pendente (transiente): ${r.pending.id}`);
  throw new Error(`Emissão ficou pendente (rede instável). ID: ${r.pending.id}`);
}

async function fetchNextJob(): Promise<NextJobResponse> {
  const baseUrl = requiredEnv("APP_BASE_URL").replace(/\/+$/, "");
  const apiKey = requiredEnv("ROBOT_API_KEY");

  const res = await fetch(`${baseUrl}/api/robot/next`, {
    method: "POST",
    headers: { "content-type": "application/json", "x-api-key": apiKey },
    body: JSON.stringify({}),
  });
  if (!res.ok) throw new Error(`Falha /api/robot/next: ${res.status}`);
  return (await res.json()) as NextJobResponse;
}

async function updateJob(input: { jobId: string; status: "EMITIDA" | "LANCADO" | "ERRO"; nfseNumber?: string; errorMessage?: string }) {
  const baseUrl = requiredEnv("APP_BASE_URL").replace(/\/+$/, "");
  const apiKey = requiredEnv("ROBOT_API_KEY");

  const tentar = async (payload: typeof input) => {
    return fetch(`${baseUrl}/api/robot/update`, {
      method: "POST",
      headers: { "content-type": "application/json", "x-api-key": apiKey },
      body: JSON.stringify(payload),
    });
  };

  let res = await tentar(input);

  if (!res.ok && input.status === "LANCADO" && res.status === 400) {
    log("API ainda não aceita LANCADO; gravando como EMITIDA temporariamente");
    res = await tentar({ ...input, status: "EMITIDA" });
  }

  if (!res.ok && res.status >= 500) {
    log(`API retornou ${res.status}; tentando novamente em 3s...`);
    await sleep(3000);
    res = await tentar(res.status === 400 && input.status === "LANCADO" ? { ...input, status: "EMITIDA" } : input);
  }

  if (!res.ok) throw new Error(`Falha /api/robot/update: ${res.status}`);
}

async function runSession(singleJob: boolean) {
  log("Inicializando cliente NFS-e Nacional (API SEFIN)...");
  const { client: cliente, tpAmb } = createNfseClient();

  try {
    for (;;) {
      const next = await fetchNextJob();
      if (!next.job) {
        log("Sem job na fila.");
        break;
      }

      try {
        const numero = await emitirNota(cliente, tpAmb, next.job);

        await updateJob({ jobId: next.job.jobId, status: "LANCADO", nfseNumber: numero });
        process.stdout.write(`Job ${next.job.jobId} concluído. Nota ${numero}.\n`);

        if (singleJob) break;
      } catch (e) {
        let msg: string;
        if (e instanceof ReceitaRejectionError) {
          msg = `Rejeitada pela SEFIN: [${e.codigo}] ${e.descricao}`;
        } else {
          msg = e instanceof Error ? e.message : String(e);
        }

        const curto = msg.split("\n")[0].slice(0, 200);
        await updateJob({ jobId: next.job.jobId, status: "ERRO", errorMessage: msg.slice(0, 500) });
        process.stderr.write(`Job ${next.job.jobId} falhou: ${curto}\n`);

        if (singleJob) break;
      }
    }
  } finally {
    await cliente.close().catch(() => {});
    log("Sessão finalizada.");
  }
}

async function main() {
  const runOnceMode = process.env.ROBOT_RUN_ONCE === "1";
  await runSession(runOnceMode);
}

main().catch((e) => {
  process.stderr.write(String(e) + "\n");
  process.exit(1);
});
