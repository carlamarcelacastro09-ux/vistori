import { chromium } from "playwright";
import * as fs from "fs";

interface NotaSite {
  nfseNumber: string;
  nDps: string;
  data: string;
  cpf: string;
  nome: string;
  chave: string;
}

function requiredEnv(name: string): string {
  const v = process.env[name];
  if (!v) throw new Error(`Env ${name} obrigatória`);
  return v;
}

function onlyDigits(s: string): string {
  return s.replace(/\D/g, "");
}

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
  const notas: NotaSite[] = [];

  try {
    console.log("Abrindo login por certificado...");
    await page.goto("https://certificado.nfse.gov.br/EmissorNacional/Certificado", {
      waitUntil: "domcontentloaded",
      timeout: 120000,
    });
    await page.waitForTimeout(10000);
    await page.screenshot({ path: "emissor-cert.png" });

    console.log("Abrindo notas emitidas...");
    await page.goto("https://www.nfse.gov.br/EmissorNacional/Notas/Emitidas", {
      waitUntil: "domcontentloaded",
      timeout: 120000,
    });

    await page.waitForTimeout(5000);
    await page.screenshot({ path: "emissor-notas-emitidas.png" });
    fs.writeFileSync("emissor-notas-emitidas.html", await page.evaluate(() => document.body.innerHTML), "utf-8");

    // Enquanto houver próxima página
    let pagina = 1;
    for (;;) {
      console.log(`Página ${pagina}...`);

      const linhas = await page.locator("table tbody tr").all();
      console.log(`  ${linhas.length} linhas encontradas`);

      for (const linha of linhas) {
        const link = linha.locator("a[href*='/EmissorNacional/Notas/Visualizar/Index/']").first();
        const href = await link.getAttribute("href").catch(() => null);
        if (!href) continue;

        const nNFSeMatch = href.match(/(\d+)\d{14}$/);
        const nfseNumber = nNFSeMatch ? String(parseInt(nNFSeMatch[1], 10)) : "";

        const data = await linha.locator("td.td-data").first().textContent().catch(() => "") || "";
        const cpfRaw = await linha.locator("span.cpf").first().textContent().catch(() => "") || "";
        const nomeRaw = await linha.locator("td.td-texto-grande").first().textContent().catch(() => "") || "";

        // Abre detalhe em nova aba para extrair nDPS
        const detalhe = await context.newPage();
        try {
          await detalhe.goto(`https://www.nfse.gov.br${href}`, {
            waitUntil: "networkidle",
            timeout: 60000,
          });
          await detalhe.waitForTimeout(2000);

          const nDpsInput = detalhe.locator("#dps-numero, input[name*='DPS.Numero'], #NumeroDPS").first();
          const nDps = await nDpsInput.inputValue().catch(async () => {
            // tenta pelo label
            const label = await detalhe.locator("text=Identificação do DPS").first().isVisible().catch(() => false);
            if (label) {
              const input = detalhe.locator("input").filter({ has: detalhe.locator("xpath=preceding-sibling::*") }).first();
              return await input.inputValue().catch(() => "");
            }
            return "";
          });

          await detalhe.screenshot({ path: `emissor-detalhe-${nfseNumber}.png` });

          notas.push({
            nfseNumber,
            nDps: nDps.trim(),
            data: data.trim(),
            cpf: onlyDigits(cpfRaw),
            nome: nomeRaw.replace(/\s+/g, " ").trim(),
            chave: href.split("/").pop() || "",
          });

          console.log(`  Nota ${nfseNumber} | DPS ${nDps.trim()} | ${data.trim()} | ${onlyDigits(cpfRaw)}`);
        } catch (e: any) {
          console.error(`  Erro nota ${nfseNumber}: ${e.message}`);
        } finally {
          await detalhe.close();
        }
      }

      // Próxima página
      const proxima = page.locator("a[rel='next'], .pagination a:has-text('Próxima'), .pagination a:has-text('›')").first();
      const hasNext = await proxima.isVisible().catch(() => false);
      if (!hasNext) break;
      await proxima.click();
      await page.waitForTimeout(3000);
      pagina++;
    }

    fs.writeFileSync("notas-emissor-nacional.json", JSON.stringify(notas, null, 2), "utf-8");

    const header = "nfseNumber,nDps,data,cpf,nome,chave\n";
    const lines = notas.map((n) => `${n.nfseNumber},${n.nDps},${n.data},${n.cpf},"${n.nome}",${n.chave}`).join("\n");
    fs.writeFileSync("notas-emissor-nacional.csv", header + lines, "utf-8");

    console.log(`\nTotal notas extraídas: ${notas.length}`);
    console.log("JSON: notas-emissor-nacional.json");
    console.log("CSV: notas-emissor-nacional.csv");
  } catch (e: any) {
    console.error("Erro:", e.message);
    await page.screenshot({ path: "emissor-notas-erro.png" });
    fs.writeFileSync("emissor-notas-erro.html", await page.evaluate(() => document.body.innerHTML), "utf-8");
    process.exit(1);
  } finally {
    await context.close();
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
