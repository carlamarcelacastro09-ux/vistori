import { chromium, Page } from "playwright";

function onlyDigits(v: string) {
  return v.replace(/\D/g, "");
}

function requiredEnv(key: string) {
  const v = process.env[key];
  if (!v) throw new Error(`Variável ${key} não definida`);
  return v;
}

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function aguardarCarregamento(page: Page) {
  const loader = page.locator(".ui-widget-overlay, .ui-blockui, .loading, .ajax-status").first();
  try {
    await loader.waitFor({ state: "hidden", timeout: 30000 }).catch(() => {});
  } catch {}
  await sleep(300);
}

async function initPortal(page: Page) {
  const loginUrl = requiredEnv("PREFEITURA_LOGIN_URL");
  const username = requiredEnv("PREFEITURA_USERNAME");
  const password = requiredEnv("PREFEITURA_PASSWORD");
  const cnpj = requiredEnv("PREFEITURA_CNPJ");

  console.log("Fazendo login...");
  await page.goto(loginUrl, { waitUntil: "domcontentloaded" });
  await page.fill("#username", username);
  await page.fill("#password", password);
  await page.keyboard.press("Enter");

  await page.waitForSelector('input[id$=":itCpfCnpj"]', { timeout: 20000 });
  await page.fill('input[id$=":itCpfCnpj"]', cnpj);
  await page.click('button[id$=":btnDefault"]');
  await sleep(3000);

  await page.click('tbody[id$=":listaContribuintes_data"] tr td:first-child');
  try {
    await page.waitForSelector('button[id$=":j_idt538"]', { state: "visible", timeout: 5000 });
    await page.click('button[id$=":j_idt538"]');
  } catch {
    try {
      await page.waitForSelector(".ui-dialog button", { state: "visible", timeout: 3000 });
      await page.locator(".ui-dialog button").first().click();
    } catch {}
  }

  console.log("Navegando para emissão...");
  await page.waitForSelector("#navNfse > a", { state: "visible", timeout: 15000 });
  await page.locator("#navNfse > a").click();
  await sleep(1000);
  await page.waitForSelector('text="Emitir NFS-e"', { state: "visible", timeout: 10000 });
  await page.click('text="Emitir NFS-e"');
  await aguardarCarregamento(page);
  await sleep(2000);
}

async function main() {
  const headless = process.env.ROBOT_HEADLESS !== "0";
  const browser = await chromium.launch({ headless, slowMo: headless ? 0 : 500 });
  const context = await browser.newContext({ viewport: { width: 1366, height: 768 } });
  const page = await context.newPage();

  try {
    await initPortal(page);

    // Dados de teste do job FNF7489
    const customerDoc = process.env.DEBUG_DOC || "05695937360";
    const customerName = process.env.DEBUG_NAME || "PEDRO ARAGAO";
    const competenceDate = "20/06/2026";
    const docLimpo = onlyDigits(customerDoc);

    // Preenche data de competência
    const dateInput = page.locator('input[id$=":imDataCompetencia_input"]').first();
    await dateInput.waitFor({ state: "visible", timeout: 10000 });
    await dateInput.focus();
    await dateInput.press("Control+a");
    await dateInput.press("Backspace");
    await dateInput.type(competenceDate, { delay: 100 });
    await dateInput.press("Tab");
    await aguardarCarregamento(page);
    await dateInput.press("Enter");
    await aguardarCarregamento(page);
    await sleep(1500);

    // Seleção Física/Jurídica
    const tipoValue = docLimpo.length <= 11 ? "FISICA" : "JURIDICA";
    const tipoSelectId = await page.waitForFunction(() => {
      for (const select of document.querySelectorAll("select")) {
        const values = Array.from(select.options).map((o) => o.value.toUpperCase());
        if (values.includes("FISICA") && values.includes("JURIDICA")) {
          return select.id;
        }
      }
      return null;
    }, { timeout: 10000 }).then((h: any) => h.jsonValue());
    if (tipoSelectId) {
      const payload = { id: tipoSelectId as string, value: tipoValue };
      await page.evaluate((data: typeof payload) => {
        const select = document.getElementById(data.id) as HTMLSelectElement | null;
        if (!select) return;
        select.value = data.value;
        select.dispatchEvent(new Event("change", { bubbles: true }));
        select.dispatchEvent(new Event("blur", { bubbles: true }));
      }, payload);
    }
    await aguardarCarregamento(page);
    await sleep(2000);

    // Preenche CPF/CNPJ
    const docLabel = docLimpo.length > 11 ? "CNPJ" : "CPF";
    const docInput = page.locator(
      `input[id$="cpfCnpjTomador"], input[aria-label*="${docLabel}"], input[placeholder*="${docLabel}"], label:has-text("${docLabel}") + input, label:has-text("${docLabel}") ~ input`,
    ).first();
    await docInput.waitFor({ state: "visible", timeout: 10000 });
    await docInput.scrollIntoViewIfNeeded();
    await docInput.fill(docLimpo);
    await docInput.press("Tab");
    await aguardarCarregamento(page);
    await sleep(10000);

    // Extrai HTML da área do Nome
    const html = await page.evaluate(() => {
      const labels = Array.from(document.querySelectorAll("label"));
      const nomeLabel = labels.find((l) => (l.textContent || "").toUpperCase().includes("NOME"));
      const container = nomeLabel?.closest("tr, td, div, fieldset");
      return {
        labelText: nomeLabel?.textContent?.trim() || "",
        labelHtml: nomeLabel?.outerHTML || "",
        containerHtml: container?.outerHTML?.slice(0, 4000) || "",
      };
    });

    console.log("=== LABEL NOME ===");
    console.log(html.labelText);
    console.log(html.labelHtml);
    console.log("=== CONTAINER NOME ===");
    console.log(html.containerHtml);

    await page.screenshot({ path: "debug-nome-field.png", fullPage: false });
    console.log("Screenshot salvo: debug-nome-field.png");
  } catch (e) {
    console.error("Erro:", e);
    await page.screenshot({ path: "debug-nome-field-erro.png", fullPage: true });
  } finally {
    await browser.close();
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
