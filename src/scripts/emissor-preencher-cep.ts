import { chromium } from "playwright";
import * as fs from "fs";

async function main() {
  const userDataDir = "emissor-user-data";
  fs.mkdirSync(userDataDir, { recursive: true });

  const context = await chromium.launchPersistentContext(userDataDir, {
    headless: true,
    channel: "chrome",
    viewport: { width: 1280, height: 900 },
    ignoreHTTPSErrors: true,
  });

  const page = await context.newPage();

  try {
    console.log("Abrindo emissor nacional...");
    await page.goto("https://www.nfse.gov.br/EmissorNacional/DPS/Pessoas", {
      waitUntil: "networkidle",
      timeout: 120000,
    });

    // Aguarda carregamento inicial da página
    await page.waitForTimeout(5000);
    await page.screenshot({ path: "emissor-pessoas-antes.png" });

    // Clica em "Exibir detalhes do emitente"
    const btnInfo = page.locator("#btnMaisInfoEmitente");
    await btnInfo.waitFor({ state: "visible", timeout: 20000 });
    console.log("Clicando em 'Exibir detalhes do emitente'...");
    await btnInfo.click();
    await page.waitForTimeout(1500);

    // Preenche o CEP do emitente
    const cepInput = page.locator("#Prestador_EnderecoNacional_CEP");
    await cepInput.waitFor({ state: "visible", timeout: 20000 });
    console.log("Preenchendo CEP do emitente com 14850037...");
    await cepInput.fill("14850037");
    await page.waitForTimeout(1000);

    await page.screenshot({ path: "emissor-pessoas-depois.png" });
    fs.writeFileSync("emissor-pessoas-depois.html", await page.evaluate(() => document.body.innerHTML), "utf-8");

    console.log("CEP preenchido. URL:", page.url());
  } catch (e: any) {
    console.error("Erro:", e.message);
    await page.screenshot({ path: "emissor-pessoas-erro.png" });
    fs.writeFileSync("emissor-pessoas-erro.html", await page.evaluate(() => document.body.innerHTML), "utf-8");
    process.exit(1);
  } finally {
    await context.close();
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
