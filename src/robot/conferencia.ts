/**
 * Robô de conferência NFS-e.
 *
 * Percorre a faixa de nDPS usada no Emissor Nacional, baixa cada NFS-e gerada,
 * extrai o veículo (placa) da descrição do serviço e o CPF/CNPJ do tomador, e
 * cruza com as vistorias do banco. Quando o número da nota gravado no sistema
 * está errado (ou ausente), corrige.
 *
 * Uso:
 *   CONFERENCIA_DPS_INICIO=6265 CONFERENCIA_DPS_FIM=6271 npm run robot:conferencia
 *   ... adicione --apply para gravar as correções (sem isso é simulação).
 */
import "dotenv/config";
import { readFileSync } from "fs";
import {
  NfseClient,
  Ambiente,
  NotFoundError,
  buildDpsId,
  createInMemoryDpsCounter,
  createInMemoryRetryStore,
} from "open-nfse";
import { prisma } from "../lib/db";

type NotaSefin = {
  nDPS: number;
  nfseNumber: string;
  descricao: string;
  doc: string;
  placa: string;
  emissao: Date;
};

function requiredEnv(name: string): string {
  const val = process.env[name];
  if (!val) throw new Error(`Env ${name} obrigatória`);
  return val;
}

function envOr(name: string, fallback: string): string {
  return process.env[name] || fallback;
}

function onlyDigits(s: string): string {
  return String(s || "").replace(/\D/g, "");
}

function normalizePlate(s: string): string {
  return String(s || "").replace(/[^A-Za-z0-9]/g, "").toUpperCase();
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

/** A descrição emitida é "VISTORIA AUTOMOTIVA - <MODELO> - <PLACA>". */
function extrairPlaca(descricao: string): string {
  const partes = descricao.split(" - ");
  return normalizePlate(partes[partes.length - 1] ?? "");
}

async function faixaDps(): Promise<{ inicio: number; fim: number }> {
  const inicio = parseInt(requiredEnv("CONFERENCIA_DPS_INICIO"), 10);
  const fimEnv = process.env.CONFERENCIA_DPS_FIM;

  let fim: number;
  if (fimEnv) {
    fim = parseInt(fimEnv, 10);
  } else {
    const contador = await prisma.dpsCounter.findUnique({
      where: {
        cnpj_serie: {
          cnpj: onlyDigits(requiredEnv("EMITENTE_CNPJ")),
          serie: envOr("NFSE_SERIE", "1"),
        },
      },
    });
    if (!contador) {
      throw new Error("Sem contador de nDPS no banco: informe CONFERENCIA_DPS_FIM.");
    }
    fim = contador.lastNumber;
  }

  if (!Number.isInteger(inicio) || !Number.isInteger(fim) || inicio < 1 || fim < inicio) {
    throw new Error("Faixa de nDPS inválida.");
  }
  return { inicio, fim };
}

async function coletarNotas(
  client: NfseClient,
  inicio: number,
  fim: number,
): Promise<{ notas: NotaSefin[]; falhas: number[] }> {
  const cnpjEmitente = onlyDigits(requiredEnv("EMITENTE_CNPJ"));
  const serie = envOr("NFSE_SERIE", "1");
  const codMunicipio = envOr("EMITENTE_COD_MUNICIPIO", "3540903");
  const notas: NotaSefin[] = [];
  const falhas: number[] = [];

  for (let nDPS = inicio; nDPS <= fim; nDPS++) {
    const idDps = buildDpsId({
      cLocEmi: codMunicipio,
      tipoInsc: "CNPJ",
      inscricaoFederal: cnpjEmitente,
      serie,
      nDPS: String(nDPS),
    });

    try {
      const status = await tentarComRetry(() => client.fetchDpsStatus(idDps));
      const consulta = await tentarComRetry(() => client.fetchByChave(status.chaveAcesso));
      const infNFSe = consulta.nfse.infNFSe;
      const tomador = infNFSe.DPS.infDPS.toma?.identificador;
      const doc = onlyDigits(
        tomador && "CPF" in tomador ? tomador.CPF : tomador && "CNPJ" in tomador ? tomador.CNPJ : "",
      );
      const descricao = infNFSe.DPS.infDPS.serv.cServ.xDescServ;

      notas.push({
        nDPS,
        nfseNumber: String(infNFSe.nNFSe),
        descricao,
        doc,
        placa: extrairPlaca(descricao),
        emissao: infNFSe.dhProc,
      });
      log(`nDPS ${nDPS} -> NFS-e ${infNFSe.nNFSe} | doc ${doc} | ${descricao}`);
    } catch (e) {
      if (e instanceof NotFoundError) {
        log(`nDPS ${nDPS} -> sem NFS-e gerada`);
      } else {
        falhas.push(nDPS);
        log(`nDPS ${nDPS} -> FALHA na consulta: ${e instanceof Error ? e.message : String(e)}`);
      }
    }

    await new Promise((r) => setTimeout(r, 400));
  }

  return { notas, falhas };
}

/** Repete consultas que falharam por erro transitório (rede/servidor). */
async function tentarComRetry<T>(fn: () => Promise<T>): Promise<T> {
  let ultimo: unknown;
  for (let tentativa = 1; tentativa <= 3; tentativa++) {
    try {
      return await fn();
    } catch (e) {
      if (e instanceof NotFoundError) throw e;
      ultimo = e;
      await new Promise((r) => setTimeout(r, 1000 * tentativa));
    }
  }
  throw ultimo;
}

type Vistoria = Awaited<ReturnType<typeof carregarVistorias>>[number];

function carregarVistorias() {
  return prisma.inspection.findMany({
    include: { customer: true, vehicle: true, job: true },
    orderBy: { date: "asc" },
  });
}

/**
 * Associa cada NFS-e à sua vistoria. Prioriza identificadores já gravados
 * (nDPS, depois número da nota). O que sobra é resolvido por grupo de
 * placa+documento: só pareia quando a ordem cronológica é inequívoca
 * (mesma quantidade de notas e de vistorias); o resto vira revisão manual.
 */
function parear(
  notas: NotaSefin[],
  vistorias: Vistoria[],
): { pares: Array<{ nota: NotaSefin; vistoria: Vistoria }>; semVistoria: NotaSefin[]; ambiguas: NotaSefin[] } {
  const pares: Array<{ nota: NotaSefin; vistoria: Vistoria }> = [];
  const semVistoria: NotaSefin[] = [];
  const ambiguas: NotaSefin[] = [];
  const usadas = new Set<string>();

  const combina = (nota: NotaSefin, v: Vistoria) =>
    !usadas.has(v.id) &&
    nota.placa !== "" &&
    normalizePlate(v.vehicle?.plate ?? "") === nota.placa &&
    (nota.doc === "" || onlyDigits(v.customer.doc) === nota.doc);

  const pendentes: NotaSefin[] = [];

  for (const nota of notas) {
    const porIdentificador = vistorias.filter(
      (v) => combina(nota, v) && (v.nDps === String(nota.nDPS) || v.nfseNumber === nota.nfseNumber),
    );
    if (porIdentificador.length === 1) {
      usadas.add(porIdentificador[0].id);
      pares.push({ nota, vistoria: porIdentificador[0] });
    } else {
      pendentes.push(nota);
    }
  }

  const grupos = new Map<string, NotaSefin[]>();
  for (const nota of pendentes) {
    const chave = `${nota.placa}|${nota.doc}`;
    const atual = grupos.get(chave);
    if (atual) atual.push(nota);
    else grupos.set(chave, [nota]);
  }

  for (const grupo of grupos.values()) {
    const candidatas = vistorias.filter((v) => combina(grupo[0], v));

    if (candidatas.length === 0) {
      semVistoria.push(...grupo);
      continue;
    }
    if (candidatas.length !== 1 || grupo.length !== 1) {
      // Mais de uma vistoria (ou mais de uma nota) para a mesma placa+documento:
      // a ordem de emissão segue a fila de jobs, não a data da vistoria, então
      // qualquer pareamento aqui seria palpite. Vai para revisão manual.
      ambiguas.push(...grupo);
      continue;
    }

    usadas.add(candidatas[0].id);
    pares.push({ nota: grupo[0], vistoria: candidatas[0] });
  }

  return { pares, semVistoria, ambiguas };
}

async function main() {
  const aplicar = process.argv.includes("--apply");
  const { inicio, fim } = await faixaDps();
  const ambiente =
    envOr("NFSE_AMBIENTE", "producao").toLowerCase() === "producao"
      ? Ambiente.Producao
      : Ambiente.ProducaoRestrita;

  const client = new NfseClient({
    ambiente,
    certificado: loadCertificate(),
    dpsCounter: createInMemoryDpsCounter(1),
    retryStore: createInMemoryRetryStore(),
  });

  try {
    log(`Conferindo nDPS ${inicio}..${fim} (${aplicar ? "APLICANDO correções" : "simulação"})`);
    const { notas, falhas } = await coletarNotas(client, inicio, fim);
    log(`Notas encontradas na SEFIN: ${notas.length}`);

    if (falhas.length > 0 && aplicar) {
      throw new Error(
        `Consulta incompleta (${falhas.length} nDPS com falha: ${falhas.join(", ")}). ` +
          "Nada foi gravado — rode novamente quando a SEFIN responder.",
      );
    }

    const vistorias = await carregarVistorias();

    const { pares, semVistoria, ambiguas } = parear(notas, vistorias);

    let corretas = 0;
    let corrigidas = 0;

    for (const { nota, vistoria } of pares) {
      if (
        vistoria.nfseNumber === nota.nfseNumber &&
        vistoria.nDps === String(nota.nDPS) &&
        vistoria.status === "LANCADO"
      ) {
        corretas++;
        continue;
      }

      log(
        `CORRIGIR: ${vistoria.vehicle?.plate ?? "?"} | ${vistoria.customer.name} | ` +
          `nota ${vistoria.nfseNumber ?? "(vazia)"} -> ${nota.nfseNumber} (nDPS ${nota.nDPS})`,
      );
      corrigidas++;

      if (!aplicar) continue;

      await prisma.$transaction(async (tx) => {
        await tx.inspection.update({
          where: { id: vistoria.id },
          data: {
            status: "LANCADO",
            nfseNumber: nota.nfseNumber,
            nDps: String(nota.nDPS),
            errorMessage: null,
          },
        });
        if (vistoria.job) {
          await tx.invoiceJob.update({
            where: { id: vistoria.job.id },
            data: { status: "CONCLUIDO", lastError: null },
          });
        }
      });
    }

    const conferidas = new Set(pares.map((p) => p.vistoria.id));
    // Vistorias com número de nota que nenhuma NFS-e da faixa confirma.
    const suspeitas = vistorias.filter((v) => v.nfseNumber && !conferidas.has(v.id));

    log("\n=== RESUMO ===");
    log(`Notas conferidas: ${notas.length}`);
    log(`Já corretas: ${corretas}`);
    log(`${aplicar ? "Corrigidas" : "A corrigir"}: ${corrigidas}`);
    log(`Notas sem vistoria correspondente: ${semVistoria.length}`);
    for (const n of semVistoria) {
      log(`  - NFS-e ${n.nfseNumber} (nDPS ${n.nDPS}) | placa ${n.placa} | doc ${n.doc}`);
    }
    log(`Notas ambíguas (revisar manualmente): ${ambiguas.length}`);
    for (const n of ambiguas) {
      log(`  ! NFS-e ${n.nfseNumber} (nDPS ${n.nDPS}) | ${n.descricao}`);
    }
    log(`Vistorias com nota não confirmada na faixa: ${suspeitas.length}`);
    for (const v of suspeitas) {
      log(`  ? ${v.vehicle?.plate ?? "-"} | ${v.customer.name} | nota ${v.nfseNumber}`);
    }
    if (falhas.length > 0) {
      log(`Consultas com falha (rode novamente): ${falhas.join(", ")}`);
      process.exitCode = 1;
    }
    if (!aplicar && corrigidas > 0) {
      log("\nNada foi gravado. Rode novamente com --apply para aplicar as correções.");
    }
  } finally {
    await client.close();
  }
}

main()
  .catch((e) => {
    console.error("Erro:", e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
