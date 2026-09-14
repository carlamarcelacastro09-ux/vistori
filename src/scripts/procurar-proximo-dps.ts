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

async function main() {
  const cert = loadCertificate();
  const ambienteStr = envOr("NFSE_AMBIENTE", "producao").toLowerCase();
  const isProducao = ambienteStr === "producao";
  const ambiente = isProducao ? Ambiente.Producao : Ambiente.ProducaoRestrita;

  const client = new NfseClient({
    ambiente,
    certificado: cert,
  });

  const cnpj = onlyDigits(requiredEnv("EMITENTE_CNPJ"));
  const codMunicipio = envOr("EMITENTE_COD_MUNICIPIO", "3540903");
  const serie = envOr("NFSE_SERIE", "1");
  const start = parseInt(process.argv[2] || "6445", 10);
  const limit = 50;

  try {
    for (let n = start; n < start + limit; n++) {
      const idDps = buildDpsId({
        cLocEmi: codMunicipio,
        tipoInsc: "CNPJ",
        inscricaoFederal: cnpj,
        serie,
        nDPS: String(n),
      });
      try {
        await client.fetchDpsStatus(idDps);
        console.log(`nDPS ${n} -> existe`);
      } catch (e: any) {
        if (e.message?.includes("not found") || e.message?.includes("não encontrad")) {
          console.log(`nDPS ${n} -> LIVRE`);
          break;
        } else {
          console.log(`nDPS ${n} -> erro: ${e.message?.slice(0, 80)}`);
        }
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
