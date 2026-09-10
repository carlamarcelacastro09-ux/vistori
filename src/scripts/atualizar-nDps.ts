import "dotenv/config";
import { prisma } from "../lib/db";
import { readFileSync } from "fs";

interface NotaSite {
  nfseNumber: string;
  nDps: string;
  data: string;
  cpf: string;
  nome: string;
  chave: string;
}

async function main() {
  const path = process.argv[2] || "notas-emissor-nacional.json";
  const notas: NotaSite[] = JSON.parse(readFileSync(path, "utf-8"));

  console.log(`Atualizando ${notas.length} notas...`);

  let atualizadas = 0;
  let naoEncontradas = 0;

  for (const n of notas) {
    const nfseNumber = n.nfseNumber;
    const nDps = n.nDps;
    if (!nfseNumber || !nDps) continue;

    const insp = await prisma.inspection.findFirst({
      where: { nfseNumber },
    });

    if (!insp) {
      console.log(`  ⚠ Nota ${nfseNumber} não encontrada no banco`);
      naoEncontradas++;
      continue;
    }

    await prisma.inspection.update({
      where: { id: insp.id },
      data: { nDps },
    });

    console.log(`  ✓ Nota ${nfseNumber} -> nDPS ${nDps}`);
    atualizadas++;
  }

  console.log(`\nAtualizadas: ${atualizadas}`);
  console.log(`Não encontradas: ${naoEncontradas}`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
