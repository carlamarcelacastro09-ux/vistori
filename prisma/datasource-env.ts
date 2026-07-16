/**
 * URL Postgres para Prisma CLI e cliente.
 * Inclui nomes usados pela integração Vercel↔Neon, Storage Postgres e templates comuns.
 */
export function resolveDatabaseUrlFromEnv(): string | undefined {
  return (
    process.env.DATABASE_URL ||
    process.env.POSTGRES_PRISMA_URL ||
    process.env.POSTGRES_URL ||
    process.env.POSTGRES_URL_NON_POOLING ||
    process.env.PRISMA_DATABASE_URL ||
    process.env.NEON_DATABASE_URL ||
    process.env.VERCEL_POSTGRES_URL
  );
}
