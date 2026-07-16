import { chromium } from "playwright";
import * as path from "path";

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

async function main() {
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage({ viewport: { width: 1366, height: 768 } });

  const loginUrl = process.env.PREFEITURA_LOGIN_URL || "";
  const usuario = process.env.PREFEITURA_USERNAME || "";
  const senha = process.env.PREFEITURA_PASSWORD || "";
  const cnpjEmpresa = process.env.PREFEITURA_CNPJ || "";

  await page.goto(loginUrl, { waitUntil: "networkidle", timeout: 60000 });
  await page.fill("#username", usuario);
  await page.fill("#password", senha);
  await page.keyboard.press("Enter");
  await page.waitForLoadState("networkidle");
  await sleep(3000);

  // Seleciona contribuinte
  await page.fill('input[id$=":itCpfCnpj"]', cnpjEmpresa);
  await page.click('button[id$=":btnDefault"]');
  await sleep(3000);
  await page.click('tbody[id$=":listaContribuintes_data"] tr td:first-child');
  await sleep(2000);

  // Navega para emissão
  await page.waitForSelector('#navNfse > a', { state: "visible", timeout: 15000 });
  await page.locator('#navNfse > a').click();
  await sleep(1000);
  await page.waitForSelector('text="Emitir NFS-e"', { state: "visible", timeout: 10000 });
  await page.click('text="Emitir NFS-e"');
  await sleep(5000);

  // Seleciona Física
  const tipoSelectId = await page.waitForFunction(() => {
    for (const select of document.querySelectorAll("select")) {
      const values = Array.from(select.options).map((o) => o.value.toUpperCase());
      if (values.includes("FISICA") && values.includes("JURIDICA")) return select.id;
    }
    return null;
  }, { timeout: 10000 }).then((h) => h.jsonValue() as Promise<string | null>);

  if (!tipoSelectId) throw new Error("select Tipo não encontrado");
  await page.evaluate(
    ([id, value]) => {
      const select = document.getElementById(id) as HTMLSelectElement | null;
      if (!select) return;
      select.value = value;
      select.dispatchEvent(new Event("change", { bubbles: true }));
      select.dispatchEvent(new Event("blur", { bubbles: true }));
    },
    [tipoSelectId, "FISICA"] as const,
  );
  await sleep(3000);

  // Dump HTML ao redor do label CPF
  const html = await page.evaluate(() => {
    const labels = Array.from(document.querySelectorAll("label"));
    const cpfLabel = labels.find((l) => {
      const text = (l.textContent || "").replace(/\*/g, "").trim().toUpperCase();
      return text === "CPF";
    });
    if (!cpfLabel) return "Label CPF não encontrado";
    const forAttr = cpfLabel.getAttribute("for");
    const target = forAttr ? document.getElementById(forAttr) : null;
    const container = cpfLabel.closest("tr, td, div, fieldset");
    return {
      labelFor: forAttr,
      targetTag: target?.tagName,
      targetId: target?.id,
      targetName: (target as HTMLInputElement)?.name,
      targetValue: (target as HTMLInputElement)?.value,
      targetType: (target as HTMLInputElement)?.type,
      containerHTML: container?.outerHTML?.slice(0, 2000),
    };
  });

  console.log(JSON.stringify(html, null, 2));

  await page.screenshot({ path: path.join(process.cwd(), "debug_cpf_dom.png") });
  await browser.close();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
