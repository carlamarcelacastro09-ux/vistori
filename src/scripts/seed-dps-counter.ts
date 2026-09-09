/**
 * Define o último nDPS já consumido pelo emitente numa série, para que o robô
 * continue a numeração sem colidir com DPS emitidas manualmente no portal.
 *
 * Uso: NFSE_DPS_SEED=6271 npx tsx src/scripts/seed-dps-counter.ts
 */
import "dotenv/config";
import { prisma } from "../lib/db";

function requiredEnv(name: string): string {
  const value = process.env[name];
  if (!value) throw new Error(`Env ${name} obrigatória`);
  return value;
}

async function main() {
  const cnpj = requiredEnv("EMITENTE_CNPJ").replace(/\D/g, "");
  const serie = process.env.NFSE_SERIE || "1";
  const lastNumber = parseInt(requiredEnv("NFSE_DPS_SEED"), 10);

  if (!Number.isInteger(lastNumber) || lastNumber < 0) {
    throw new Error("NFSE_DPS_SEED deve ser um inteiro >= 0");
  }

  const atual = await prisma.dpsCounter.findUnique({ where: { cnpj_serie: { cnpj, serie } } });
  if (atual && atual.lastNumber > lastNumber) {
    throw new Error(
      `Contador já está em ${atual.lastNumber}, maior que ${lastNumber}. Regredir reemitiria números já usados.`,
    );
  }

  await prisma.dpsCounter.upsert({
    where: { cnpj_serie: { cnpj, serie } },
    create: { cnpj, serie, lastNumber },
    update: { lastNumber },
  });

  process.stdout.write(`Contador de nDPS (${cnpj}/série ${serie}) = ${lastNumber}. Próximo: ${lastNumber + 1}\n`);
}

main()
  .catch((e) => {
    console.error("Erro:", e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
