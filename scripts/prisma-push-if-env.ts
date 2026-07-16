import { spawnSync } from "node:child_process";
import { resolveDatabaseUrlFromEnv } from "../prisma/datasource-env";

/**
 * Só corre `prisma db push` quando existe URL (Vercel/Neon).
 * Sem URL: não falha o build — evita bloqueio total; a app precisa da mesma variável em runtime.
 */
const url = resolveDatabaseUrlFromEnv();
if (!url) {
  console.warn(
    "\n[build] Nenhuma URL de Postgres encontrada (DATABASE_URL, POSTGRES_PRISMA_URL, POSTGRES_URL, POSTGRES_URL_NON_POOLING, PRISMA_DATABASE_URL, NEON_DATABASE_URL ou VERCEL_POSTGRES_URL).",
  );
  console.warn(
    "[build] A saltar prisma db push. Na Vercel: Settings → Environment Variables → coloca a connection string do Neon e faz Redeploy.\n",
  );
  process.exit(0);
}

const r = spawnSync("npx", ["prisma", "db", "push", "--accept-data-loss"], {
  stdio: "inherit",
  shell: true,
  env: process.env,
});
process.exit(r.status ?? 1);
