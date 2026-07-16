import "dotenv/config";
import { chromium } from "playwright";

function sleep(ms: number) {
  return new Promise((r) => setTimeout(r, ms));
}

async function aguardarCarregamento(page: any) {
  await page.waitForFunction(() => {
    const block = document.querySelector(".ui-blockui");
    return !block || window.getComputedStyle(block as Element).display === "none";
  }, { timeout: 30000 }).catch(() => {});
}

async function initPortal(page: any) {
  const loginUrl = process.env.PREFEITURA_LOGIN_URL!;
  const username = process.env.PREFEITURA_USERNAME!;
  const password = process.env.PREFEITURA_PASSWORD!;
  const cnpj = process.env.PREFEITURA_CNPJ!;

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

  await page.waitForSelector('#navNfse > a', { state: "visible", timeout: 15000 });
  await page.locator('#navNfse > a').click();
  await sleep(1000);
  await page.waitForSelector('text="Emitir NFS-e"', { state: "visible", timeout: 10000 });
  await page.click('text="Emitir NFS-e"');
  await aguardarCarregamento(page);
  await sleep(2000);
}

async function main() {
  const browser = await chromium.launch({ headless: false, slowMo: 500 });
  const context = await browser.newContext({ viewport: { width: 1366, height: 768 } });
  const page = await context.newPage();

  await initPortal(page);

  // Fill date
  const dateInput = page.locator('input[id$=":imDataCompetencia_input"]').first();
  await dateInput.fill("20/06/2026");
  await dateInput.press("Tab");
  await page.waitForTimeout(2000);

  // Fill CPF
  const cpfInput = page.locator('input[id$="cpfCnpjTomador"]').first();
  await cpfInput.fill("59017768878");
  await cpfInput.press("Tab");
  await page.waitForTimeout(5000);

  // Dump HTML around Nome
  const html = await page.evaluate(() => {
    const labels = Array.from(document.querySelectorAll("label"));
    const nomeLabel = labels.find((l) => l.textContent?.toUpperCase().includes("NOME"));
    if (!nomeLabel) return "Label Nome não encontrado";
    const input = nomeLabel.closest("tr, div, td")?.querySelector("input, textarea");
    return input?.outerHTML || "Input não encontrado";
  });

  console.log("HTML do campo Nome:");
  console.log(html);

  // Dump all inputs near Nome
  const all = await page.evaluate(() => {
    return Array.from(document.querySelectorAll('input, textarea'))
      .filter((el) => {
        const label = el.getAttribute("aria-label") || el.getAttribute("placeholder") || el.id;
        return label?.toUpperCase().includes("NOME") || label?.toUpperCase().includes("RAZAO");
      })
      .map((el) => ({
        tag: el.tagName,
        id: el.id,
        type: el.getAttribute("type"),
        ariaLabel: el.getAttribute("aria-label"),
        placeholder: el.getAttribute("placeholder"),
        name: el.getAttribute("name"),
        disabled: (el as HTMLInputElement).disabled,
        hidden: (el as HTMLElement).hidden,
        outerHTML: el.outerHTML.slice(0, 200),
      }));
  });

  console.log("\nTodos inputs relacionados a Nome:");
  console.log(JSON.stringify(all, null, 2));

  await page.waitForTimeout(10000);
  await browser.close();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
