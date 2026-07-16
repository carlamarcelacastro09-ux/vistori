import { NextResponse } from "next/server";
import { z } from "zod";
import { getSession } from "@/lib/session";

export const maxDuration = 30;

const bodySchema = z.object({
  workflow: z.enum(["robot", "import"]),
});

const WORKFLOW_FILE: Record<string, string> = {
  robot: "robot-cron.yml",
  import: "import-cron.yml",
};

const WORKFLOW_LABEL: Record<string, string> = {
  robot: "Robô",
  import: "Importação",
};

async function triggerGitHubWorkflow(workflow: string) {
  const owner = process.env.GITHUB_OWNER;
  const repo = process.env.GITHUB_REPO;
  const token = process.env.GITHUB_TOKEN;
  const ref = process.env.GITHUB_REF || "main";

  if (!owner || !repo || !token) {
    throw new Error("GITHUB_OWNER, GITHUB_REPO e GITHUB_TOKEN precisam estar configurados na Vercel.");
  }

  const file = WORKFLOW_FILE[workflow];
  const url = `https://api.github.com/repos/${owner}/${repo}/actions/workflows/${file}/dispatches`;

  const res = await fetch(url, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      Accept: "application/vnd.github+json",
      "X-GitHub-Api-Version": "2022-11-28",
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ ref }),
  });

  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new Error(`GitHub API retornou ${res.status}: ${body.slice(0, 200)}`);
  }

  return WORKFLOW_LABEL[workflow];
}

export async function POST(req: Request) {
  const session = await getSession();
  if (!session.user) return NextResponse.json({ ok: false }, { status: 401 });
  if (session.user.role !== "ADMIN") return NextResponse.json({ ok: false }, { status: 403 });

  const body = (await req.json().catch(() => null)) as unknown;
  const parsed = bodySchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ ok: false, message: "Dados inválidos." }, { status: 400 });
  }

  try {
    const label = await triggerGitHubWorkflow(parsed.data.workflow);
    return NextResponse.json({
      ok: true,
      message: `${label} disparado via GitHub Actions. Acompanhe o progresso na aba Actions do GitHub.`,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Erro ao disparar workflow.";
    return NextResponse.json({ ok: false, message }, { status: 500 });
  }
}

