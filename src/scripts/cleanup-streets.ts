import "dotenv/config";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "../generated/prisma/client";
import { cityKey, normalizeText, removeDiacritics } from "../lib/normalize";

function requiredEnv(name: string) {
  const v = process.env[name];
  if (!v) throw new Error(`Variável ${name} não configurada.`);
  return v;
}

function normUpper(v: string) {
  return removeDiacritics(normalizeText(v)).toUpperCase();
}

function onlyDigits(v: string) {
  return String(v || "").replace(/\D/g, "");
}

async function main() {
  const databaseUrl = requiredEnv("DATABASE_URL");
  const adapter = new PrismaPg({ connectionString: databaseUrl });
  const prisma = new PrismaClient({ adapter });

  try {
    const rows = await prisma.street.findMany({
      select: { id: true, street: true, district: true, city: true, cep: true },
    });

    const groups = new Map<
      string,
      { keepId: string; street: string; district: string; city: string; cep: string; deleteIds: string[] }
    >();

    for (const r of rows) {
      const street = normUpper(r.street);
      const district = normUpper(r.district);
      const city = cityKey(r.city);
      const cep = onlyDigits(r.cep);
      const key = `${street}|${district}|${city}|${cep}`;

      const g = groups.get(key);
      if (!g) {
        groups.set(key, { keepId: r.id, street, district, city, cep, deleteIds: [] });
      } else {
        g.deleteIds.push(r.id);
      }
    }

    const toDelete: string[] = [];
    const toUpdate: { id: string; street: string; district: string; city: string; cep: string }[] = [];

    for (const g of groups.values()) {
      toDelete.push(...g.deleteIds);
      toUpdate.push({ id: g.keepId, street: g.street, district: g.district, city: g.city, cep: g.cep });
    }

    for (let i = 0; i < toDelete.length; i += 200) {
      const batch = toDelete.slice(i, i + 200);
      await prisma.street.deleteMany({ where: { id: { in: batch } } });
    }

    for (let i = 0; i < toUpdate.length; i += 200) {
      const batch = toUpdate.slice(i, i + 200);
      for (const u of batch) {
        await prisma.street.update({
          where: { id: u.id },
          data: { street: u.street, district: u.district, city: u.city, cep: u.cep },
        });
      }
    }

    process.stdout.write(
      `Limpeza concluída. Total: ${rows.length}. Removidas duplicadas: ${toDelete.length}. Mantidas: ${toUpdate.length}.\n`,
    );
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((e) => {
  process.stderr.write(String(e) + "\n");
  process.exit(1);
});
