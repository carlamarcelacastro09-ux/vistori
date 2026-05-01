/** Evita trabalho com DB durante `next build` (Vercel/Turbopack nem sempre exporta NEXT_PHASE/npm_lifecycle nos workers). */

function hasAnyDatabaseEnv(): boolean {
  return Boolean(
    process.env.DATABASE_URL ||
      process.env.POSTGRES_URL ||
      process.env.POSTGRES_PRISMA_URL ||
      process.env.PRISMA_DATABASE_URL ||
      process.env.NEON_DATABASE_URL,
  );
}

function isArgvNextBuild(): boolean {
  try {
    return process.argv.includes("build");
  } catch {
    return false;
  }
}

/** Fase oficial do Next durante compilação. */
export function isNextProductionBuildPhase(): boolean {
  if (process.env.NEXT_PHASE === "phase-production-build") return true;
  if (process.env.npm_lifecycle_event === "build") return true;
  /** `next build`: argv contém `"build"`; no runtime da Vercel em geral não. */
  if (isArgvNextBuild() && !hasAnyDatabaseEnv()) return true;
  return false;
}
