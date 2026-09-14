import "dotenv/config";
import { readFileSync, existsSync } from "node:fs";
import { NfseClient, Ambiente, buildDpsId } from "open-nfse";

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

async function existsDps(client: NfseClient, cnpj: string, codMun: string, serie: string, n: number): Promise<boolean> {
  const idDps = buildDpsId({
    cLocEmi: codMun,
    tipoInsc: "CNPJ",
    inscricaoFederal: cnpj,
    serie,
    nDPS: String(n),
  });
  try {
    await client.fetchDpsStatus(idDps);
    return true;
  } catch (e: any) {
    return !(e.message?.includes("not found") || e.message?.includes("não encontrad"));
  }
}

async function main() {
  const cert = loadCertificate();
  const ambiente = envOr("NFSE_AMBIENTE", "producao").toLowerCase() === "producao" ? Ambiente.Producao : Ambiente.ProducaoRestrita;

  const client = new NfseClient({ ambiente, certificado: cert });
  const cnpj = onlyDigits(requiredEnv("EMITENTE_CNPJ"));
  const codMun = envOr("EMITENTE_COD_MUNICIPIO", "3540903");
  const serie = envOr("NFSE_SERIE", "1");

  // Procura saltando de 50 em 50 a partir de start
  const start = parseInt(process.argv[2] || "6600", 10);
  const end = start + 500;

  try {
    for (let base = start; base < end; base += 50) {
      const existe = await existsDps(client, cnpj, codMun, serie, base);
      console.log(`${base} -> ${existe ? "EXISTE" : "LIVRE"}`);
      if (!existe) {
        console.log(`Primeiro intervalo livre começa em ${base}`);
        break;
      }
    }
  } finally {
    await client.close().catch(() => {});
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
