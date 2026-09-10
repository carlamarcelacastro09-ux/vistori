/**
 * Robô de conferência NFS-e.
 *
 * Lista na SEFIN todas as NFS-e emitidas pelo CNPJ (distribuição de DFe, o que
 * cobre todas as séries, inclusive as emitidas manualmente no portal), descarta
 * as canceladas, extrai o veículo (placa) da descrição do serviço e o CPF/CNPJ
 * do tomador, e cruza com as vistorias do banco. Quando o número da nota
 * gravado no sistema está errado (ou ausente), corrige.
 *
 * Uso:
 *   npm run robot:conferencia            # simulação, não grava nada
 *   npm run robot:conferencia -- --apply # grava as correções
 */
import "dotenv/config";
import { readFileSync } from "fs";
import {
  NfseClient,
  Ambiente,
  NotFoundError,
  StatusDistribuicao,
  TipoDocumento,
  TipoEvento,
  createInMemoryDpsCounter,
  createInMemoryRetryStore,
} from "open-nfse";
import { prisma } from "../lib/db";

type NotaSefin = {
  chaveAcesso: string;
  serie: string;
  nDPS: number;
  nfseNumber: string;
  descricao: string;
  doc: string;
  placa: string;
  valor: number;
  emissao: Date;
  cancelada: boolean;
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
  return String(s || "")
    .replace(/[^A-Za-z0-9]/g, "")
    .toUpperCase();
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

/**
 * A placa aparece em formatos diferentes conforme o emissor usado:
 * "VISTORIA AUTOMOTIVA - GOL - DCB6362", "... - PLACA: EDV-6H73 - MODELO: PALIO"
 * ou "GAM-9C48<tab>CG160<tab>HONDA". Procura o padrão de placa no texto todo.
 */
function extrairPlaca(descricao: string): string {
  const texto = descricao.toUpperCase();
  const comRotulo = texto.match(/PLACA:?\s*([A-Z0-9-]{7,8})/);
  if (comRotulo) return normalizePlate(comRotulo[1]);
  const padrao = texto.match(/\b([A-Z]{3}-?[0-9][0-9A-Z][0-9]{2})\b/);
  return padrao ? normalizePlate(padrao[1]) : "";
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

/**
 * Percorre a distribuição de DFe do emitente: devolve as chaves das NFS-e por
 * ele emitidas (a distribuição também traz notas em que ele é tomador) e as
 * chaves com evento de cancelamento.
 */
async function coletarChaves(
  client: NfseClient,
  cnpjEmitente: string,
): Promise<{ emitidas: string[]; canceladas: Set<string> }> {
  const eventosCancelamento = new Set<TipoEvento>([
    TipoEvento.Cancelamento,
    TipoEvento.CancelamentoPorSubstituicao,
    TipoEvento.CancelamentoDeferidoAnaliseFiscal,
    TipoEvento.CancelamentoPorOficio,
  ]);
  const emitidas = new Set<string>();
  const canceladas = new Set<string>();

  let ultimoNsu = 0;
  for (;;) {
    const pagina = await tentarComRetry(() =>
      client.fetchByNsu({ ultimoNsu, cnpjConsulta: cnpjEmitente, lote: true }),
    );
    for (const doc of pagina.documentos) {
      if (doc.tipoEvento && eventosCancelamento.has(doc.tipoEvento)) {
        canceladas.add(doc.chaveAcesso);
      } else if (doc.tipoDocumento === TipoDocumento.Nfse && ehDoEmitente(doc.chaveAcesso, cnpjEmitente)) {
        emitidas.add(doc.chaveAcesso);
      }
    }
    if (pagina.status !== StatusDistribuicao.DocumentosEncontrados || pagina.ultimoNsu <= ultimoNsu) {
      break;
    }
    ultimoNsu = pagina.ultimoNsu;
  }

  log(`NFS-e emitidas pelo CNPJ: ${emitidas.size} | eventos de cancelamento: ${canceladas.size}`);
  return { emitidas: [...emitidas], canceladas };
}

/** A chave de acesso carrega o CNPJ do emitente nas posições 9..22. */
function ehDoEmitente(chaveAcesso: string, cnpjEmitente: string): boolean {
  return chaveAcesso.slice(9, 23) === cnpjEmitente;
}

async function coletarNotas(
  client: NfseClient,
  chaves: string[],
  canceladas: Set<string>,
): Promise<{ notas: NotaSefin[]; falhas: string[] }> {
  const notas: NotaSefin[] = [];
  const falhas: string[] = [];

  for (const chave of chaves) {
    try {
      const consulta = await tentarComRetry(() => client.fetchByChave(chave));
      const infNFSe = consulta.nfse.infNFSe;
      const tomador = infNFSe.DPS.infDPS.toma?.identificador;
      const doc = onlyDigits(
        tomador && "CPF" in tomador ? tomador.CPF : tomador && "CNPJ" in tomador ? tomador.CNPJ : "",
      );
      const descricao = infNFSe.DPS.infDPS.serv.cServ.xDescServ;

      notas.push({
        chaveAcesso: chave,
        serie: infNFSe.DPS.infDPS.serie,
        nDPS: parseInt(infNFSe.DPS.infDPS.nDPS, 10),
        nfseNumber: String(infNFSe.nNFSe),
        descricao,
        doc,
        placa: extrairPlaca(descricao),
        valor: infNFSe.valores.vLiq,
        emissao: infNFSe.dhProc,
        cancelada: canceladas.has(chave),
      });
    } catch (e) {
      falhas.push(chave);
      log(`chave ${chave} -> FALHA na consulta: ${e instanceof Error ? e.message : String(e)}`);
    }

    await new Promise((r) => setTimeout(r, 200));
  }

  notas.sort((a, b) => a.emissao.getTime() - b.emissao.getTime());
  return { notas, falhas };
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
      (v) => combina(nota, v) && (v.dpsNumber === String(nota.nDPS) || v.nfseNumber === nota.nfseNumber),
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
  const cnpjEmitente = onlyDigits(requiredEnv("EMITENTE_CNPJ"));
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
    log(`Conferindo NFS-e do CNPJ ${cnpjEmitente} (${aplicar ? "APLICANDO correções" : "simulação"})`);
    const { emitidas, canceladas } = await coletarChaves(client, cnpjEmitente);
    const { notas: todasNotas, falhas } = await coletarNotas(client, emitidas, canceladas);
    const notasCanceladas = todasNotas.filter((n) => n.cancelada);
    const notas = todasNotas.filter((n) => !n.cancelada);
    log(`Notas encontradas na SEFIN: ${todasNotas.length} (${notasCanceladas.length} canceladas)`);

    if (falhas.length > 0 && aplicar) {
      throw new Error(
        `Consulta incompleta (${falhas.length} chaves com falha). ` +
          "Nada foi gravado — rode novamente quando a SEFIN responder.",
      );
    }

    const vistorias = await carregarVistorias();

    const { pares, semVistoria, ambiguas } = parear(notas, vistorias);

    let corretas = 0;
    let corrigidas = 0;
    let numerosTrocados = 0;

    for (const { nota, vistoria } of pares) {
      if (
        vistoria.nfseNumber === nota.nfseNumber &&
        vistoria.dpsNumber === String(nota.nDPS) &&
        vistoria.status === "LANCADO"
      ) {
        corretas++;
        continue;
      }

      const trocaNumero = vistoria.nfseNumber !== null && vistoria.nfseNumber !== nota.nfseNumber;
      log(
        `${trocaNumero ? "TROCAR NÚMERO" : "COMPLETAR"}: ${vistoria.vehicle?.plate ?? "?"} | ${vistoria.customer.name} | ` +
          `nota ${vistoria.nfseNumber ?? "(vazia)"} -> ${nota.nfseNumber} (série ${nota.serie}, nDPS ${nota.nDPS})`,
      );
      corrigidas++;
      if (trocaNumero) numerosTrocados++;

      if (!aplicar) continue;

      await prisma.$transaction(async (tx) => {
        await tx.inspection.update({
          where: { id: vistoria.id },
          data: {
            status: "LANCADO",
            nfseNumber: nota.nfseNumber,
            dpsNumber: String(nota.nDPS),
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
    // Vistorias com número de nota que nenhuma NFS-e ativa da SEFIN confirma.
    const suspeitas = vistorias.filter((v) => v.nfseNumber && !conferidas.has(v.id));

    log("\n=== RESUMO ===");
    log(`Notas ativas conferidas: ${notas.length}`);
    log(`Já corretas: ${corretas}`);
    log(`${aplicar ? "Corrigidas" : "A corrigir"}: ${corrigidas} (${numerosTrocados} com número de nota diferente)`);
    log(`Notas sem vistoria correspondente: ${semVistoria.length}`);
    for (const n of semVistoria) {
      log(`  - NFS-e ${n.nfseNumber} (série ${n.serie}, nDPS ${n.nDPS}) | placa ${n.placa} | doc ${n.doc}`);
    }
    const valorEsperado = parseFloat(envOr("NFSE_VALOR_ESPERADO", "25"));
    // Só as notas que pertencem a alguma vistoria: as antigas do portal têm preços de outra época.
    const valorDivergente = pares.map((p) => p.nota).filter((n) => n.valor !== valorEsperado);
    log(`Notas de vistorias com valor diferente de R$ ${valorEsperado.toFixed(2)}: ${valorDivergente.length}`);
    for (const n of valorDivergente) {
      log(`  $ NFS-e ${n.nfseNumber} (série ${n.serie}) | R$ ${n.valor.toFixed(2)} | ${n.descricao}`);
    }
    log(`Notas canceladas (ignoradas na correção): ${notasCanceladas.length}`);
    for (const n of notasCanceladas) {
      log(`  x NFS-e ${n.nfseNumber} (série ${n.serie}) | R$ ${n.valor.toFixed(2)} | ${n.descricao}`);
    }
    log(`Notas ambíguas (revisar manualmente): ${ambiguas.length}`);
    for (const n of ambiguas) {
      log(`  ! NFS-e ${n.nfseNumber} (série ${n.serie}, nDPS ${n.nDPS}) | ${n.descricao}`);
    }
    log(`Vistorias com nota não confirmada na SEFIN: ${suspeitas.length}`);
    for (const v of suspeitas) {
      log(`  ? ${v.vehicle?.plate ?? "-"} | ${v.customer.name} | nota ${v.nfseNumber}`);
    }
    if (falhas.length > 0) {
      log(`Consultas com falha (rode novamente): ${falhas.length}`);
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
