/** Evita trabalho com DB durante `next build` (Vercel/Turbopack nem sempre exporta NEXT_PHASE/npm_lifecycle nos workers). */

import { resolveDatabaseUrlFromEnv } from "../../prisma/datasource-env";

function hasAnyDatabaseEnv(): boolean {
  return Boolean(resolveDatabaseUrlFromEnv());
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
