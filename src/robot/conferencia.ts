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

async function coletarNotas(client: NfseClient, inicio: number, fim: number): Promise<NotaSefin[]> {
  const cnpjEmitente = onlyDigits(requiredEnv("EMITENTE_CNPJ"));
  const serie = envOr("NFSE_SERIE", "1");
  const codMunicipio = envOr("EMITENTE_COD_MUNICIPIO", "3540903");
  const notas: NotaSefin[] = [];

  for (let nDPS = inicio; nDPS <= fim; nDPS++) {
    const idDps = buildDpsId({
      cLocEmi: codMunicipio,
      tipoInsc: "CNPJ",
      inscricaoFederal: cnpjEmitente,
      serie,
      nDPS: String(nDPS),
    });

    try {
      const status = await client.fetchDpsStatus(idDps);
      const consulta = await client.fetchByChave(status.chaveAcesso);
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
        log(`nDPS ${nDPS} -> erro na consulta: ${e instanceof Error ? e.message : String(e)}`);
      }
    }

    await new Promise((r) => setTimeout(r, 400));
  }

  return notas;
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
    const notas = await coletarNotas(client, inicio, fim);
    log(`Notas encontradas na SEFIN: ${notas.length}`);

    const vistorias = await prisma.inspection.findMany({
      include: { customer: true, vehicle: true, job: true },
      orderBy: { date: "asc" },
    });

    const usadas = new Set<string>();
    let corretas = 0;
    let corrigidas = 0;
    const semVistoria: NotaSefin[] = [];

    for (const nota of notas) {
      const candidatas = vistorias.filter(
        (v) =>
          !usadas.has(v.id) &&
          nota.placa !== "" &&
          normalizePlate(v.vehicle?.plate ?? "") === nota.placa &&
          (nota.doc === "" || onlyDigits(v.customer.doc) === nota.doc),
      );

      // Preferimos a vistoria que já aponta para esta nota; senão, a mais próxima da emissão.
      const escolhida =
        candidatas.find((v) => v.nfseNumber === nota.nfseNumber) ??
        candidatas.sort(
          (a, b) =>
            Math.abs(a.date.getTime() - nota.emissao.getTime()) -
            Math.abs(b.date.getTime() - nota.emissao.getTime()),
        )[0];

      if (!escolhida) {
        semVistoria.push(nota);
        log(`SEM VISTORIA: NFS-e ${nota.nfseNumber} (nDPS ${nota.nDPS}) | placa ${nota.placa} | doc ${nota.doc}`);
        continue;
      }

      usadas.add(escolhida.id);

      if (
        escolhida.nfseNumber === nota.nfseNumber &&
        escolhida.dpsNumber === String(nota.nDPS) &&
        escolhida.status === "LANCADO"
      ) {
        corretas++;
        continue;
      }

      log(
        `CORRIGIR: ${escolhida.vehicle?.plate ?? "?"} | ${escolhida.customer.name} | ` +
          `nota ${escolhida.nfseNumber ?? "(vazia)"} -> ${nota.nfseNumber} (nDPS ${nota.nDPS})`,
      );
      corrigidas++;

      if (!aplicar) continue;

      await prisma.$transaction(async (tx) => {
        await tx.inspection.update({
          where: { id: escolhida.id },
          data: {
            status: "LANCADO",
            nfseNumber: nota.nfseNumber,
            dpsNumber: String(nota.nDPS),
            errorMessage: null,
          },
        });
        if (escolhida.job) {
          await tx.invoiceJob.update({
            where: { id: escolhida.job.id },
            data: { status: "CONCLUIDO", lastError: null },
          });
        }
      });
    }

    // Vistorias com número de nota que nenhuma NFS-e da faixa confirma.
    const suspeitas = vistorias.filter((v) => v.nfseNumber && !usadas.has(v.id));

    log("\n=== RESUMO ===");
    log(`Notas conferidas: ${notas.length}`);
    log(`Já corretas: ${corretas}`);
    log(`${aplicar ? "Corrigidas" : "A corrigir"}: ${corrigidas}`);
    log(`Notas sem vistoria correspondente: ${semVistoria.length}`);
    log(`Vistorias com nota não confirmada na faixa: ${suspeitas.length}`);
    for (const v of suspeitas) {
      log(`  ? ${v.vehicle?.plate ?? "-"} | ${v.customer.name} | nota ${v.nfseNumber}`);
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
