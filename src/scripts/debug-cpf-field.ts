import "dotenv/config";
import { chromium } from "playwright";
import path from "node:path";

function sleep(ms: number) {
  return new Promise((r) => setTimeout(r, ms));
}

function requiredEnv(name: string) {
  const v = process.env[name];
  if (!v) throw new Error(`Variável ${name} não configurada.`);
  return v;
}

async function main() {
  const loginUrl = requiredEnv("PREFEITURA_LOGIN_URL");
  const username = requiredEnv("PREFEITURA_USERNAME");
  const password = requiredEnv("PREFEITURA_PASSWORD");
  const cnpj = requiredEnv("PREFEITURA_CNPJ");
  const emissaoUrl =
    process.env.PREFEITURA_EMISSAO_URL ||
    "http://pradopolis.ddns.net:5661/issweb/paginas/admin/notafiscal/convencional/emissaopadrao";

  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({ viewport: { width: 1366, height: 768 } });
  const page = await context.newPage();

  console.log("Login...");
  await page.goto(loginUrl, { waitUntil: "domcontentloaded" });
  await page.fill("#username", username);
  await page.fill("#password", password);
  await page.keyboard.press("Enter");

  console.log("Aguardando tela de seleção de contribuinte...");
  await page.waitForSelector('input[id$=":itCpfCnpj"]', { timeout: 20000 });
  await page.fill('input[id$=":itCpfCnpj"]', cnpj);
  await page.click('button[id$=":btnDefault"]');
  await sleep(3000);
  await page.click('tbody[id$=":listaContribuintes_data"] tr td:first-child');
  await sleep(2000);

  console.log("Navegando para emissão via menu...");
  await page.waitForSelector('#navNfse > a', { state: "visible", timeout: 15000 });
  await page.locator('#navNfse > a').click();
  await sleep(1000);
  await page.waitForSelector('text="Emitir NFS-e"', { state: "visible", timeout: 10000 });
  await page.click('text="Emitir NFS-e"');
  await sleep(5000);

  console.log("Selecionando tipo Física...");
  const tipoSelectId = await page.waitForFunction(() => {
    for (const select of document.querySelectorAll("select")) {
      const values = Array.from(select.options).map((o) => o.value.toUpperCase());
      if (values.includes("FISICA") && values.includes("JURIDICA")) return select.id;
    }
    return null;
  }, { timeout: 10000 }).then((h) => h.jsonValue() as Promise<string | null>);
  if (!tipoSelectId) {
    await page.screenshot({ path: path.join(process.cwd(), "debug_cpf_no_tipo.png") });
    throw new Error("select Tipo não encontrado");
  }
  await page.evaluate(
    ([id, value]) => {
      const select = document.getElementById(id) as HTMLSelectElement | null;
      if (!select) return;
      select.value = value;
      select.dispatchEvent(new Event("change", { bubbles: true }));
      select.dispatchEvent(new Event("blur", { bubbles: true }));
      const menu = select.closest(".ui-selectonemenu") as HTMLElement | null;
      if (menu) {
        menu.dispatchEvent(new Event("change", { bubbles: true }));
        menu.dispatchEvent(new Event("blur", { bubbles: true }));
      }
    },
    [tipoSelectId, "FISICA"] as const,
  );
  await sleep(2000);

  console.log("Tirando screenshot inicial...");
  await page.screenshot({ path: path.join(process.cwd(), "debug_cpf_inicial.png") });

  // Localiza campo CPF
  const info = await page.evaluate(() => {
    const labels = Array.from(document.querySelectorAll("label"));
    const cpfLabel = labels.find((l) => {
      const text = (l.textContent || "").replace(/\*/g, "").trim().toUpperCase();
      return text === "CPF" || text.startsWith("CPF");
    });
    if (!cpfLabel) return { error: "Label CPF não encontrado" };
    const forAttr = cpfLabel.getAttribute("for");
    let input: Element | null = null;
    if (forAttr) input = document.getElementById(forAttr);
    if (!input) {
      const container = cpfLabel.closest("tr, td, div, fieldset, .ui-panelgrid-cell");
      input = container?.querySelector("input, textarea") || null;
    }
    if (!input) return { error: "Input CPF não encontrado" };

    const htmlInput = input as HTMLInputElement;
    return {
      labelText: cpfLabel.textContent,
      inputId: htmlInput.id,
      inputName: htmlInput.name,
      inputType: htmlInput.type,
      inputValue: htmlInput.value,
      inputReadonly: htmlInput.readOnly,
      inputDisabled: htmlInput.disabled,
      inputPlaceholder: htmlInput.placeholder,
      inputOuterHTML: htmlInput.outerHTML.slice(0, 500),
      parentHTML: htmlInput.parentElement?.outerHTML.slice(0, 500),
    };
  });

  console.log("Info do campo CPF:", JSON.stringify(info, null, 2));

  // Tenta várias formas de preencher
  const cpf = "578.449.778-08";

  // Método 1: fill
  try {
    const docInput = page.locator(`[id="${(info as any).inputId}"]`);
    await docInput.fill(cpf);
    await sleep(1000);
    const v1 = await docInput.inputValue();
    console.log("Método fill -> valor:", v1);
    await page.screenshot({ path: path.join(process.cwd(), "debug_cpf_fill.png") });
  } catch (e) {
    console.log("Método fill falhou:", e);
  }

  // Método 2: focus + keyboard
  try {
    const docInput = page.locator(`[id="${(info as any).inputId}"]`);
    await docInput.click();
    await page.keyboard.press("Control+a");
    await page.keyboard.type(cpf, { delay: 50 });
    await sleep(1000);
    const v2 = await docInput.inputValue();
    console.log("Método type -> valor:", v2);
    await page.screenshot({ path: path.join(process.cwd(), "debug_cpf_type.png") });
  } catch (e) {
    console.log("Método type falhou:", e);
  }

  // Método 3: JS set value
  try {
    const id = (info as any).inputId;
    await page.evaluate(
      ([id, value]) => {
        const input = document.getElementById(id) as HTMLInputElement | null;
        if (!input) throw new Error("Input não encontrado");
        input.value = value;
        input.dispatchEvent(new Event("focus", { bubbles: true }));
        input.dispatchEvent(new Event("input", { bubbles: true }));
        input.dispatchEvent(new Event("change", { bubbles: true }));
        input.dispatchEvent(new Event("blur", { bubbles: true }));
        (input as any).oninput && (input as any).oninput();
      },
      [id, cpf] as const,
    );
    await sleep(1000);
    const v3 = await page.locator(`[id="${id}"]`).inputValue();
    console.log("Método JS -> valor:", v3);
    await page.screenshot({ path: path.join(process.cwd(), "debug_cpf_js.png") });
  } catch (e) {
    console.log("Método JS falhou:", e);
  }

  console.log("Fim do debug. Pressione Enter no terminal para fechar o navegador...");
  await new Promise((r) => process.stdin.once("data", r));
  await browser.close();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
