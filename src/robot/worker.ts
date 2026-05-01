import { chromium } from "playwright";

type NextJobResponse =
  | { ok: true; job: null }
  | {
      ok: true;
      job: {
        jobId: string;
        competenceDate: string;
        paidValue: number;
        noteValue: number;
        plate: string;
        vehicleBrand: string;
        vehicleModel: string;
        customerDoc: string;
        customerName: string;
        cep: string;
        street: string;
        number: string;
        district: string;
        city: string;
      };
    };

type NextJobWithJob = Extract<NextJobResponse, { ok: true; job: { jobId: string } }>;
type Job = NextJobWithJob["job"];

function requiredEnv(name: string) {
  const v = process.env[name];
  if (!v) throw new Error(`Variável ${name} não configurada.`);
  return v;
}

function sleep(ms: number) {
  return new Promise((r) => setTimeout(r, ms));
}

async function fetchNextJob(): Promise<NextJobResponse> {
  const baseUrl = requiredEnv("APP_BASE_URL").replace(/\/+$/, "");
  const apiKey = requiredEnv("ROBOT_API_KEY");

  const res = await fetch(`${baseUrl}/api/robot/next`, {
    method: "POST",
    headers: { "content-type": "application/json", "x-api-key": apiKey },
    body: JSON.stringify({}),
  });
  if (!res.ok) throw new Error(`Falha /api/robot/next: ${res.status}`);
  return (await res.json()) as NextJobResponse;
}

async function updateJob(input: { jobId: string; status: "EMITIDA" | "ERRO"; nfseNumber?: string; errorMessage?: string }) {
  const baseUrl = requiredEnv("APP_BASE_URL").replace(/\/+$/, "");
  const apiKey = requiredEnv("ROBOT_API_KEY");

  const res = await fetch(`${baseUrl}/api/robot/update`, {
    method: "POST",
    headers: { "content-type": "application/json", "x-api-key": apiKey },
    body: JSON.stringify(input),
  });
  if (!res.ok) throw new Error(`Falha /api/robot/update: ${res.status}`);
}

async function emitirNfse(job: Job) {
  const loginUrl = requiredEnv("PREFEITURA_LOGIN_URL");
  const emissaoUrl = process.env.PREFEITURA_EMISSAO_URL;
  const username = requiredEnv("PREFEITURA_USERNAME");
  const password = requiredEnv("PREFEITURA_PASSWORD");
  const cnpj = requiredEnv("PREFEITURA_CNPJ");

  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({ viewport: { width: 1366, height: 768 } });
  const page = await context.newPage();

  try {
    await page.goto(loginUrl, { waitUntil: "domcontentloaded" });
    await page.fill("#username", username);
    await page.fill("#password", password);
    await page.keyboard.press("Enter");

    await page.waitForSelector('input[id$=":itCpfCnpj"]', { timeout: 20000 });
    await page.fill('input[id$=":itCpfCnpj"]', cnpj);
    await page.click('button[id$=":btnDefault"]');
    await page.waitForTimeout(2500);

    await page.click('tbody[id$=":listaContribuintes_data"] tr td:first-child');
    try {
      await page.waitForSelector(".ui-dialog button", { state: "visible", timeout: 5000 });
      await page.locator(".ui-dialog button").first().click();
    } catch {}

    if (emissaoUrl) {
      await page.goto(emissaoUrl, { waitUntil: "domcontentloaded" });
    } else {
      await page.waitForSelector('text="Nota Fiscal"', { timeout: 15000 });
      await page.click('text="Nota Fiscal"');
      await page.click('text="Emitir NFS-e"');
      await page.waitForTimeout(2500);
    }

    await page.waitForSelector('input[id$=":imDataCompetencia_input"]', { timeout: 15000 });
    await page.fill('input[id$=":imDataCompetencia_input"]', job.competenceDate);
    await page.keyboard.press("Tab");

    await page.click('label[id$=":tipoPessoa_label"]');
    await page.waitForTimeout(400);
    const docDigits = job.customerDoc.replace(/\D/g, "");
    if (docDigits.length > 11) await page.click('li[data-label="Jurídica"]');
    else await page.click('li[data-label="Física"]');

    await page.waitForTimeout(800);
    await page.keyboard.press("Tab");
    await page.waitForTimeout(300);
    await page.keyboard.type(docDigits);
    await page.keyboard.press("Tab");
    await page.waitForTimeout(3500);

    const valorNome = await page.inputValue('input[id$=":razaoNome"]');
    if (!valorNome || valorNome.trim() === "") {
      await page.fill('input[id$=":razaoNome"]', job.customerName.toUpperCase());
      await page.fill('input[id$=":cep"]', job.cep.replace(/\D/g, ""));
      await page.keyboard.press("Tab");
      await page.waitForTimeout(2500);

      const logradouro = await page.inputValue('input[id$=":logradouro"]');
      if (!logradouro || logradouro.trim() === "") {
        await page.fill('input[id$=":logradouro"]', job.street.toUpperCase());
        await page.fill('input[id$=":bairro"]', job.district.toUpperCase());
        await page.click('input[id$=":municipios_input"]');
        await page.keyboard.type(job.city.toUpperCase());
        await page.waitForTimeout(900);
        await page.keyboard.press("Enter");
      }

      await page.fill('input[id$=":numero"]', job.number.toUpperCase());
    }

    await page.click('label[id$=":listaAtvAtd_label"]');
    await page.waitForTimeout(400);
    await page.keyboard.press("ArrowDown");
    await page.keyboard.press("Enter");
    await page.waitForTimeout(400);

    await page.click('label[id$=":listaNBS_label"]');
    await page.waitForTimeout(400);
    for (let i = 0; i < 4; i++) await page.keyboard.press("ArrowDown");
    await page.keyboard.press("Enter");
    await page.waitForTimeout(400);

    const desc = `VISTORIA AUTOMOTIVA - PLACA: ${job.plate} - MODELO: ${job.vehicleModel}`;
    await page.fill('textarea[id$=":descricaoItem"]', desc);
    await page.fill('input[id$=":vlrUnitario_input"]', "25,00");

    await page.locator('button[id$=":btnAddItem"]').first().click();
    await page.waitForTimeout(2000);

    try {
      await page.locator('button:has-text("Salvar"):visible').first().click({ timeout: 5000 });
    } catch {
      await page.locator('button[id$=":btnDefault"]:visible').last().click();
    }

    await page.waitForSelector('button:has-text("Sim"):visible, .ui-confirmdialog-yes:visible', { timeout: 10000 });
    await page.locator('button:has-text("Sim"):visible, .ui-confirmdialog-yes:visible').first().click();

    await page.waitForSelector(".ui-messages-info-detail:visible", { timeout: 15000 });

    const textoCompleto = await page.locator('label:has-text("Número:")').locator("..").innerText();
    const match = textoCompleto.match(/\d+/);
    const numero = match ? match[0] : null;
    if (!numero) throw new Error("Não foi possível capturar o número da nota.");

    return numero;
  } finally {
    await context.close();
    await browser.close();
  }
}

async function runOnce() {
  const next = await fetchNextJob();
  if (!next.job) {
    process.stdout.write("Sem job na fila.\n");
    return false;
  }

  try {
    const numero = await emitirNfse(next.job);
    await updateJob({ jobId: next.job.jobId, status: "EMITIDA", nfseNumber: numero });
    process.stdout.write(`Job ${next.job.jobId} concluído. Nota ${numero}.\n`);
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    await updateJob({ jobId: next.job.jobId, status: "ERRO", errorMessage: msg.slice(0, 500) });
    process.stderr.write(`Job ${next.job.jobId} falhou: ${msg}\n`);
  }

  return true;
}

async function main() {
  const runOnceMode = process.env.ROBOT_RUN_ONCE === "1";
  if (runOnceMode) {
    await runOnce();
    return;
  }

  for (;;) {
    const didWork = await runOnce();
    await sleep(didWork ? 1500 : 5000);
  }
}

main().catch((e) => {
  process.stderr.write(String(e) + "\n");
  process.exit(1);
});
