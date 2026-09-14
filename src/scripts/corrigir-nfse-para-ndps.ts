import "dotenv/config";
import { prisma } from "../lib/db";

async function main() {
  const before = await prisma.$queryRaw<{ count: number }[]>`
    SELECT COUNT(*) as count FROM "Inspection"
    WHERE "nDps" IS NOT NULL
      AND "nfseNumber" IS NOT NULL
      AND "nfseNumber" <> "nDps"
  `;
  console.log("Antes:", before[0].count);

  await prisma.$queryRaw`
    UPDATE "Inspection"
    SET "nfseNumber" = "nDps"
    WHERE "nDps" IS NOT NULL
      AND "nfseNumber" IS NOT NULL
      AND "nfseNumber" <> "nDps"
  `;

  const after = await prisma.$queryRaw<{ count: number }[]>`
    SELECT COUNT(*) as count FROM "Inspection"
    WHERE "nDps" IS NOT NULL
      AND "nfseNumber" IS NOT NULL
      AND "nfseNumber" <> "nDps"
  `;
  console.log("Depois:", after[0].count);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
