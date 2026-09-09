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

  // Numa única query: só avança o contador, nunca regride — mesmo que o robô
  // reserve um número entre a leitura e a escrita.
  const aplicado = await prisma.$queryRaw<Array<{ lastNumber: number }>>`
    INSERT INTO "DpsCounter" ("cnpj", "serie", "lastNumber", "updatedAt")
    VALUES (${cnpj}, ${serie}, ${lastNumber}, now())
    ON CONFLICT ("cnpj", "serie")
    DO UPDATE SET "lastNumber" = EXCLUDED."lastNumber", "updatedAt" = now()
    WHERE "DpsCounter"."lastNumber" <= EXCLUDED."lastNumber"
    RETURNING "lastNumber"
  `;

  if (aplicado.length === 0) {
    const atual = await prisma.dpsCounter.findUnique({ where: { cnpj_serie: { cnpj, serie } } });
    throw new Error(
      `Contador já está em ${atual?.lastNumber}, maior que ${lastNumber}. Regredir reemitiria números já usados.`,
    );
  }

  process.stdout.write(`Contador de nDPS (${cnpj}/série ${serie}) = ${lastNumber}. Próximo: ${lastNumber + 1}\n`);
}

main()
  .catch((e) => {
    console.error("Erro:", e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
