import { NextResponse } from "next/server";
import { z } from "zod";
import { getSession } from "@/lib/session";

const bodySchema = z.object({
  workflow: z.enum(["robot", "import"]),
});

function requiredEnv(name: string) {
  const v = process.env[name];
  if (!v) throw new Error(`Variável ${name} não configurada.`);
  return v;
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

  const owner = requiredEnv("GITHUB_OWNER");
  const repo = requiredEnv("GITHUB_REPO");
  const token = requiredEnv("GITHUB_TOKEN");
  const ref = process.env.GITHUB_REF || "main";

  const workflowFile = parsed.data.workflow === "robot" ? "robot-cron.yml" : "import-cron.yml";
  const url = `https://api.github.com/repos/${owner}/${repo}/actions/workflows/${workflowFile}/dispatches`;

  const res = await fetch(url, {
    method: "POST",
    headers: {
      accept: "application/vnd.github+json",
      authorization: `Bearer ${token}`,
      "x-github-api-version": "2022-11-28",
      "content-type": "application/json",
    },
    body: JSON.stringify({ ref }),
  }).catch(() => null);

  if (!res) return NextResponse.json({ ok: false, message: "Falha de conexão com GitHub." }, { status: 502 });
  if (res.status !== 204) {
    const text = await res.text().catch(() => "");
    return NextResponse.json({ ok: false, message: `GitHub retornou ${res.status}. ${text}`.trim() }, { status: 502 });
  }

  return NextResponse.json({ ok: true });
}

