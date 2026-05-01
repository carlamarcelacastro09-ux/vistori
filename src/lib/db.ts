import { PrismaClient } from "@/generated/prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import { resolveDatabaseUrlFromEnv } from "../../prisma/datasource-env";

const globalForPrisma = globalThis as unknown as { prisma?: PrismaClient };

function resolveDatabaseUrl(): string | undefined {
  return resolveDatabaseUrlFromEnv();
}

function getPrismaClient(): PrismaClient {
  if (globalForPrisma.prisma) return globalForPrisma.prisma;

  const connectionString = resolveDatabaseUrl();
  if (!connectionString) {
    throw new Error("DATABASE_URL não configurado.");
  }
  const adapter = new PrismaPg({ connectionString });
  const client = new PrismaClient({
    adapter,
    log: ["error", "warn"],
  });
  globalForPrisma.prisma = client;
  return client;
}

/**
 * Sob demanda: evita erro na importação do módulo durante `next build` quando ainda não há DATABASE_URL no ambiente de compilação.
 * Na primeira chamada real ao banco, DATABASE_URL já deve existir (Vercel, local com .env, etc.).
 */
export const prisma = new Proxy({} as PrismaClient, {
  get(_target, prop, receiver) {
    const client = getPrismaClient();
    const value = Reflect.get(client, prop, receiver);
    if (typeof value === "function") {
      return value.bind(client);
    }
    return value;
  },
}) as unknown as PrismaClient;
