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
  NotFoundError,
  buildDpsId,
  createInMemoryRetryStore,
} from "open-nfse";
import type { DpsCounter, DpsCounterScope } from "open-nfse";

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
        dpsNumber: string | null;
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

/**
 * Contador de nDPS persistido no banco via API, com incremento atômico.
 * O nDPS é uma sequência própria do emitente por série — independente do nNFSe
 * devolvido pela SEFIN — e nunca pode repetir (rejeição E0014).
 */
function createApiDpsCounter(): DpsCounter & { lastIssued: string | null; currentJobId: string | null } {
  const baseUrl = requiredEnv("APP_BASE_URL").replace(/\/+$/, "");
  const apiKey = requiredEnv("ROBOT_API_KEY");

  const counter = {
    lastIssued: null as string | null,
    currentJobId: null as string | null,
    async next(scope: DpsCounterScope): Promise<string> {
      const res = await fetch(`${baseUrl}/api/robot/next-dps`, {
        method: "POST",
        headers: { "content-type": "application/json", "x-api-key": apiKey },
        body: JSON.stringify({ cnpj: scope.emitenteCnpj, serie: scope.serie, jobId: counter.currentJobId ?? undefined }),
      });
      if (!res.ok) throw new Error(`Falha /api/robot/next-dps: ${res.status}`);
      const data = (await res.json()) as { nDPS?: string };
      if (!data.nDPS) throw new Error("Resposta inválida de /api/robot/next-dps");
      counter.lastIssued = data.nDPS;
      log(`nDPS reservado: ${data.nDPS} (série ${scope.serie})`);
      return data.nDPS;
    },
  };

  return counter;
}

function createNfseClient() {
  const cert = loadCertificate();
  const ambienteStr = envOr("NFSE_AMBIENTE", "producao").toLowerCase();
  const isProducao = ambienteStr === "producao";
  const ambiente = isProducao ? Ambiente.Producao : Ambiente.ProducaoRestrita;

  const dpsCounter = createApiDpsCounter();

  return {
    client: new NfseClient({
      ambiente,
      certificado: cert,
      dpsCounter,
      retryStore: createInMemoryRetryStore(),
    }),
    dpsCounter,
    tpAmb: isProducao ? TipoAmbienteDps.Producao : TipoAmbienteDps.Homologacao,
  };
}

const CEP_FALLBACK = "14850037";

async function emitirNota(cliente: NfseClient, dpsCounter: DpsCounter & { lastIssued: string | null }, tpAmb: TipoAmbienteDps, job: Job, useFallbackCep = false): Promise<string> {
  const docLimpo = onlyDigits(job.customerDoc);
  const cepLimpo = useFallbackCep ? CEP_FALLBACK : onlyDigits(job.cep);

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
    const nDPS = dpsCounter.lastIssued ?? nNFSe;
    log(`SUCESSO: NFS-e emitida! Chave: ${chave} | nNFSe: ${nNFSe} | nDPS: ${nDPS}`);
    return String(nDPS);
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

async function updateJob(input: { jobId: string; status: "EMITIDA" | "LANCADO" | "ERRO"; nfseNumber?: string; dpsNumber?: string; errorMessage?: string }) {
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

const MAX_TENTATIVAS_E0014 = 5;

/**
 * Emite retentando quando a SEFIN acusa nDPS duplicado (E0014): cada tentativa
 * consome um novo número do contador, avançando a série até um número livre.
 */
async function emitirComAvancoDeSerie(
  cliente: NfseClient,
  dpsCounter: DpsCounter & { lastIssued: string | null },
  tpAmb: TipoAmbienteDps,
  job: Job,
  useFallbackCep = false,
): Promise<string> {
  for (let tentativa = 1; ; tentativa++) {
    try {
      return await emitirNota(cliente, dpsCounter, tpAmb, job, useFallbackCep);
    } catch (e) {
      const duplicado = e instanceof ReceitaRejectionError && e.codigo === "E0014";
      if (!duplicado || tentativa >= MAX_TENTATIVAS_E0014) throw e;
      log(`nDPS já usado na SEFIN (E0014). Avançando para o próximo número (tentativa ${tentativa}).`);
    }
  }
}

/**
 * Consulta na SEFIN a NFS-e gerada a partir de um nDPS já reservado numa
 * tentativa anterior. Retorna o nNFSe quando a nota existe — evita emitir uma
 * segunda nota para o mesmo serviço quando o robô morreu após o envio.
 */
async function buscarNfsePorDps(cliente: NfseClient, nDPS: string, job: Job): Promise<string | null> {
  const idDps = buildDpsId({
    cLocEmi: envOr("EMITENTE_COD_MUNICIPIO", "3540903"),
    tipoInsc: "CNPJ",
    inscricaoFederal: onlyDigits(requiredEnv("EMITENTE_CNPJ")),
    serie: envOr("NFSE_SERIE", "1"),
    nDPS,
  });

  try {
    const status = await cliente.fetchDpsStatus(idDps);
    const consulta = await cliente.fetchByChave(status.chaveAcesso);
    const infNFSe = consulta.nfse.infNFSe;
    const tomador = infNFSe.DPS.infDPS.toma?.identificador;
    const docNota = onlyDigits(
      tomador && "CPF" in tomador ? tomador.CPF : tomador && "CNPJ" in tomador ? tomador.CNPJ : "",
    );

    const descricao = infNFSe.DPS.infDPS.serv.cServ.xDescServ.toUpperCase();
    const placa = job.plate.replace(/[^A-Za-z0-9]/g, "").toUpperCase();

    // O número pode pertencer a outra nota (colisão E0014): só reconcilia quando
    // a nota encontrada é deste mesmo serviço — mesmo tomador e mesma placa.
    const mesmoTomador = docNota !== "" && docNota === onlyDigits(job.customerDoc);
    const mesmaPlaca = placa !== "" && descricao.replace(/[^A-Z0-9]/g, "").includes(placa);
    if (!mesmoTomador || !mesmaPlaca) {
      log(`nDPS ${nDPS} pertence a outra nota (tomador ${docNota || "?"} / "${descricao}"). Emitindo com um novo número.`);
      return null;
    }

    return String(infNFSe.nNFSe);
  } catch (e) {
    if (e instanceof NotFoundError) return null;
    throw e;
  }
}

async function runSession(singleJob: boolean) {
  log("Inicializando cliente NFS-e Nacional (API SEFIN)...");
  const { client: cliente, dpsCounter, tpAmb } = createNfseClient();

  try {
    for (;;) {
      const next = await fetchNextJob();
      if (!next.job) {
        log("Sem job na fila.");
        break;
      }

      dpsCounter.currentJobId = next.job.jobId;

      try {
        // Tentativa anterior pode ter enviado a DPS e morrido antes de gravar o resultado.
        if (next.job.dpsNumber) {
          const jaEmitida = await buscarNfsePorDps(cliente, next.job.dpsNumber, next.job);
          if (jaEmitida) {
            log(`nDPS ${next.job.dpsNumber} já gerou a NFS-e ${jaEmitida} na SEFIN. Reconciliando sem reemitir.`);
            await updateJob({ jobId: next.job.jobId, status: "LANCADO", nfseNumber: jaEmitida, dpsNumber: next.job.dpsNumber });
            if (singleJob) break;
            continue;
          }
        }

        const numero = await emitirComAvancoDeSerie(cliente, dpsCounter, tpAmb, next.job);

        await updateJob({ jobId: next.job.jobId, status: "LANCADO", nfseNumber: numero, dpsNumber: dpsCounter.lastIssued ?? undefined });
        process.stdout.write(`Job ${next.job.jobId} concluído. Nota ${numero}.\n`);

        if (singleJob) break;
      } catch (e) {
        // Se erro E0240 (CEP inválido), retentar com CEP padrão
        if (e instanceof ReceitaRejectionError && e.codigo === "E0240") {
          log(`CEP inválido (${next.job.cep}). Retentando com CEP padrão ${CEP_FALLBACK}...`);
          try {
            const numero = await emitirComAvancoDeSerie(cliente, dpsCounter, tpAmb, next.job, true);
            await updateJob({ jobId: next.job.jobId, status: "LANCADO", nfseNumber: numero, dpsNumber: dpsCounter.lastIssued ?? undefined });
            process.stdout.write(`Job ${next.job.jobId} concluído (CEP fallback). Nota ${numero}.\n`);
            if (singleJob) break;
            continue;
          } catch (e2) {
            const msg2 = e2 instanceof ReceitaRejectionError
              ? `Rejeitada pela SEFIN: [${e2.codigo}] ${e2.descricao}`
              : (e2 instanceof Error ? e2.message : String(e2));
            await updateJob({ jobId: next.job.jobId, status: "ERRO", errorMessage: msg2.slice(0, 500) });
            process.stderr.write(`Job ${next.job.jobId} falhou (CEP fallback): ${msg2.split("\n")[0].slice(0, 200)}\n`);
            if (singleJob) break;
            continue;
          }
        }

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
