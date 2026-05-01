/** URL Postgres para Prisma CLI e cliente. Mesma lista de variáveis em todo o projeto. */
export function resolveDatabaseUrlFromEnv(): string | undefined {
  return (
    process.env.DATABASE_URL ||
    process.env.POSTGRES_URL ||
    process.env.POSTGRES_PRISMA_URL ||
    process.env.PRISMA_DATABASE_URL ||
    process.env.NEON_DATABASE_URL
  );
}
