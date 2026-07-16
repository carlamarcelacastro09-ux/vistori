import "dotenv/config";
import { chromium, type Page } from "playwright";
import os from "node:os";
import path from "node:path";

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

function envOr(name: string, fallback: string) {
  return process.env[name] || fallback;
}

function sleep(ms: number) {
  return new Promise((r) => setTimeout(r, ms));
}

function onlyDigits(v: string) {
  return String(v || "").replace(/\D/g, "");
}

function formatCpfCnpj(v: string) {
  const d = onlyDigits(v);
  if (d.length <= 11) {
    const p1 = d.slice(0, 3);
    const p2 = d.slice(3, 6);
    const p3 = d.slice(6, 9);
    const p4 = d.slice(9, 11);
    let out = p1;
    if (p2) out += `.${p2}`;
    if (p3) out += `.${p3}`;
    if (p4) out += `-${p4}`;
    return out;
  }
  const p1 = d.slice(0, 2);
  const p2 = d.slice(2, 5);
  const p3 = d.slice(5, 8);
  const p4 = d.slice(8, 12);
  const p5 = d.slice(12, 14);
  let out = p1;
  if (p2) out += `.${p2}`;
  if (p3) out += `.${p3}`;
  if (p4) out += `/${p4}`;
  if (p5) out += `-${p5}`;
  return out;
}

function ajustarDataCompetencia(dataCompetencia: string) {
  const hoje = new Date();
  hoje.setHours(0, 0, 0, 0);

  const [dia, mes, ano] = dataCompetencia.split("/").map(Number);
  const dataVistoria = new Date(ano, mes - 1, dia);
  dataVistoria.setHours(0, 0, 0, 0);

  const diffDias = Math.floor((hoje.getTime() - dataVistoria.getTime()) / (1000 * 60 * 60 * 24));
  if (diffDias > 35) {
    const dataMaxima = new Date(hoje.getTime() - 35 * 24 * 60 * 60 * 1000);
    const dd = String(dataMaxima.getDate()).padStart(2, "0");
    const mm = String(dataMaxima.getMonth() + 1).padStart(2, "0");
    const yyyy = dataMaxima.getFullYear();
    return `${dd}/${mm}/${yyyy}`;
  }

  return dataCompetencia;
}

function log(msg: string) {
  process.stdout.write(`[robot] ${msg}\n`);
}

async function aguardarCarregamento(page: Page) {
  const loading = page.getByText("Por Favor, aguarde...");
  if (await loading.isVisible().catch(() => false)) {
    await loading.waitFor({ state: "hidden", timeout: 30000 });
  }
}

/** Copia fiel do loop interno do robo_notas.py / robo_vistorias.py */
async function processarNota(page: Page, job: Job, lastNumber: string | null) {
  const docLimpo = onlyDigits(job.customerDoc);
  const cepPlanilha = onlyDigits(job.cep);

  if (!docLimpo) throw new Error("Sem documento válido (CPF/CNPJ).");

  log(`Processando: ${job.plate} | Cliente: ${job.customerName.slice(0, 15)}...`);

  const dataCompetencia = ajustarDataCompetencia(job.competenceDate);
  if (dataCompetencia !== job.competenceDate) {
    log(`Data ajustada de ${job.competenceDate} para ${dataCompetencia}`);
  }

  // Data de competência
  const dateInput = page.locator('input[id$=":imDataCompetencia_input"]');
  await dateInput.waitFor({ state: "visible", timeout: 10000 });
  await dateInput.focus();
  await dateInput.press("Control+a");
  await dateInput.press("Backspace");
  await dateInput.type(dataCompetencia, { delay: 100 });
  await dateInput.press("Tab");
  await aguardarCarregamento(page);
  await dateInput.press("Enter");
  await aguardarCarregamento(page);

  const dateInputId = await dateInput.getAttribute("id");
  if (dateInputId) {
    await page.evaluate((id) => {
      const el = document.getElementById(id);
      if (el) {
        el.dispatchEvent(new Event("change", { bubbles: true }));
        el.dispatchEvent(new Event("blur", { bubbles: true }));
      }
    }, dateInputId);
  }
  await aguardarCarregamento(page);
  await sleep(1000);

  // Seleção Física/Jurídica via <select> oculto do PrimeFaces
  const tipoValue = docLimpo.length <= 11 ? "FISICA" : "JURIDICA";
  const tipoSelectId = await page.waitForFunction(() => {
    for (const select of document.querySelectorAll("select")) {
      const values = Array.from(select.options).map((o) => o.value.toUpperCase());
      if (values.includes("FISICA") && values.includes("JURIDICA")) {
        return select.id;
      }
    }
    return null;
  }, { timeout: 10000 }).then((h) => h.jsonValue() as Promise<string | null>);
  if (!tipoSelectId) throw new Error("select Tipo não encontrado");
  await page.evaluate(
    ([id, value]) => {
      const select = document.getElementById(id) as HTMLSelectElement | null;
      if (!select) throw new Error("select Tipo não encontrado");
      select.value = value;
      select.dispatchEvent(new Event("change", { bubbles: true }));
      select.dispatchEvent(new Event("blur", { bubbles: true }));
      const menu = select.closest(".ui-selectonemenu") as HTMLElement | null;
      if (menu) {
        menu.dispatchEvent(new Event("change", { bubbles: true }));
        menu.dispatchEvent(new Event("blur", { bubbles: true }));
      }
    },
    [tipoSelectId, tipoValue] as const,
  );
  await aguardarCarregamento(page);
  await sleep(1500);

  // Preenchimento documento (CPF/CNPJ)
  const docLabel = docLimpo.length > 11 ? "CNPJ" : "CPF";
  const docHandle = await page.evaluateHandle((labelText) => {
    const labels = Array.from(document.querySelectorAll("label"));
    const docLabel = labels.find((l) => {
      const text = (l.textContent || "").replace(/\*/g, "").trim().toUpperCase();
      return text === labelText || text.startsWith(labelText);
    });
    if (!docLabel) return null;
    const forAttr = docLabel.getAttribute("for");
    if (forAttr) {
      const el = document.getElementById(forAttr);
      if (el && (el.tagName === "INPUT" || el.tagName === "TEXTAREA")) return el;
    }
    const container = docLabel.closest("tr, td, div, fieldset, .ui-panelgrid-cell");
    const input = container?.querySelector("input, textarea");
    return input ?? null;
  }, docLabel);

  const docInputId = await docHandle.evaluate((el: Element | null) => el?.id || null).catch(() => null);
  await docHandle.dispose();
  if (!docInputId) throw new Error(`Campo ${docLabel} do tomador não encontrado na página`);

  const docInput = page.locator(`[id="${docInputId}"]`);
  await docInput.waitFor({ state: "visible", timeout: 10000 });
  await docInput.scrollIntoViewIfNeeded();
  const docFormatted = formatCpfCnpj(docLimpo);

  // Debug: log e screenshot antes de preencher
  const infoAntes = await page.evaluate((id) => {
    const input = document.getElementById(id) as HTMLInputElement | null;
    if (!input) return null;
    return {
      value: input.value,
      readonly: input.readOnly,
      disabled: input.disabled,
      type: input.type,
      placeholder: input.placeholder,
      outerHTML: input.outerHTML.slice(0, 300),
    };
  }, docInputId);
  log(`Campo ${docLabel} antes: ${JSON.stringify(infoAntes)}`);
  await page.screenshot({ path: path.join(os.tmpdir(), `debug_doc_antes_${job.plate}.png`) }).catch(() => {});

  // Tenta preencher via click + type lento com valor formatado
  await docInput.click({ force: true });
  await page.keyboard.press("Control+a");
  await page.keyboard.type(docFormatted, { delay: 50 });
  await page.keyboard.press("Tab");
  await aguardarCarregamento(page);
  await sleep(1500);

  // Confere se o documento foi realmente preenchido (tolerante a campos mascarados)
  let docValue = await docInput.inputValue().catch(() => "");
  log(`Valor ${docLabel} após type formatado: "${docValue}"`);

  if (docValue.replace(/\D/g, "") !== docLimpo) {
    log(`Documento formatado não pegou, tentando fallback JS no campo ${docLabel}`);
    await page.evaluate(
      ([labelText, value]) => {
        const labels = Array.from(document.querySelectorAll("label"));
        const docLabel = labels.find((l) => {
          const text = (l.textContent || "").replace(/\*/g, "").trim().toUpperCase();
          return text === labelText || text.startsWith(labelText);
        });
        if (!docLabel) throw new Error("Label documento não encontrado no DOM");
        const forAttr = docLabel.getAttribute("for");
        let input: HTMLInputElement | null = null;
        if (forAttr) input = document.getElementById(forAttr) as HTMLInputElement | null;
        if (!input) {
          const container = docLabel.closest("tr, td, div, fieldset, .ui-panelgrid-cell");
          input = container?.querySelector("input, textarea") as HTMLInputElement | null;
        }
        if (!input) throw new Error("Campo documento não encontrado no DOM");
        input.value = value;
        input.dispatchEvent(new Event("focus", { bubbles: true }));
        input.dispatchEvent(new Event("input", { bubbles: true }));
        input.dispatchEvent(new Event("change", { bubbles: true }));
        input.dispatchEvent(new Event("blur", { bubbles: true }));
      },
      [docLabel, docFormatted] as const,
    );
    await aguardarCarregamento(page);
    await sleep(1500);
    docValue = await docInput.inputValue().catch(() => "");
    log(`Valor ${docLabel} após JS: "${docValue}"`);
  }

  await page.screenshot({ path: path.join(os.tmpdir(), `debug_doc_depois_${job.plate}.png`) }).catch(() => {});

  // Não valida mais rigorosamente input.value, pois campos mascarados podem ter o valor visível
  // sem refletir em input.value. O erro real será detectado na submissão.

  // Localiza campo Nome/Razão Social pela label (robusto contra IDs gerados)
  const nomeHandle = await page.evaluateHandle(() => {
    const labels = Array.from(document.querySelectorAll("label"));
    const nomeLabel = labels.find((l) => {
      const text = (l.textContent || "").replace(/\*/g, "").trim().toUpperCase();
      return text === "NOME" || text === "RAZÃO SOCIAL" || text === "NOME/RAZÃO SOCIAL";
    });
    if (!nomeLabel) return null;
    const forAttr = nomeLabel.getAttribute("for");
    if (forAttr) {
      const el = document.getElementById(forAttr);
      if (el && (el.tagName === "INPUT" || el.tagName === "TEXTAREA")) return el;
    }
    const container = nomeLabel.closest("tr, td, div, fieldset");
    const input = container?.querySelector("input, textarea");
    return input ?? null;
  });
  const nomeId = await nomeHandle.evaluate((el: Element | null) => el?.id || null).catch(() => null);
  await nomeHandle.dispose();

  if (!nomeId) {
    throw new Error("Campo Nome do tomador não encontrado na página");
  }
  const nomeInput = page.locator(`[id="${nomeId}"]`);

  // Verifica cliente novo
  const valorNome = await nomeInput.inputValue().catch(() => "");
  if (!valorNome || valorNome.trim() === "") {
    log("Cliente novo — inserindo dados");
    try {
      await nomeInput.fill(job.customerName.toUpperCase());
    } catch (e) {
      log("fill padrão falhou, usando fallback JS no campo Nome");
      await page.evaluate((name) => {
        const labels = Array.from(document.querySelectorAll("label"));
        const nomeLabel = labels.find((l) => {
          const text = (l.textContent || "").replace(/\*/g, "").trim().toUpperCase();
          return text === "NOME" || text === "RAZÃO SOCIAL" || text === "NOME/RAZÃO SOCIAL";
        });
        if (!nomeLabel) throw new Error("Label Nome não encontrada");
        const forAttr = nomeLabel.getAttribute("for");
        let input: HTMLInputElement | HTMLTextAreaElement | null = null;
        if (forAttr) input = document.getElementById(forAttr) as HTMLInputElement | HTMLTextAreaElement | null;
        if (!input) {
          const container = nomeLabel.closest("tr, td, div, fieldset");
          input = container?.querySelector("input, textarea") as HTMLInputElement | HTMLTextAreaElement | null;
        }
        if (!input) throw new Error("Campo Nome não encontrado no DOM");
        input.value = name;
        input.dispatchEvent(new Event("input", { bubbles: true }));
        input.dispatchEvent(new Event("change", { bubbles: true }));
        input.dispatchEvent(new Event("blur", { bubbles: true }));
      }, job.customerName.toUpperCase());
    }

    const cepInput = page.getByLabel("CEP").first();
    await cepInput.fill(cepPlanilha);
    await cepInput.press("Tab");
    await aguardarCarregamento(page);
    await sleep(3000);

    const logradouroInput = page.getByLabel("Logradouro").first();
    const logradouro = await logradouroInput.inputValue().catch(() => "");
    if (logradouro === "") {
      await logradouroInput.fill(job.street.toUpperCase());
      await page.getByLabel("Bairro").first().fill(job.district.toUpperCase());
      const cidadeInput = page.getByLabel("Cidade").first();
      await cidadeInput.fill(job.city.toUpperCase());
      await cidadeInput.press("Enter");
      await aguardarCarregamento(page);
    }

    await page.getByLabel("Número").first().fill(job.number);
  } else {
    log(`Cliente cadastrado: ${valorNome.trim()}`);
  }

  async function selecionarDropdown(labelSuffix: string, labelText?: string, arrowDownCount = 1) {
    await aguardarCarregamento(page);

    let component = page.locator(`[id*="${labelSuffix}"]`).first();
    const count = await component.count().catch(() => 0);
    if (count === 0 && labelText) {
      component = page.getByLabel(labelText, { exact: false }).first();
    }

    const visible = await component.isVisible({ timeout: 5000 }).catch(() => false);
    if (!visible) {
      log(`Dropdown ${labelSuffix} não encontrado visível; pulando`);
      return;
    }

    const currentValue = await component.inputValue().catch(() => "");
    if (currentValue && currentValue !== "Selecione..." && currentValue.trim() !== "") {
      log(`Dropdown ${labelSuffix} já preenchido: ${currentValue.slice(0, 30)}`);
      return;
    }

    await component.scrollIntoViewIfNeeded();
    await component.click({ force: true });
    await sleep(1000);

    const panel = page.locator(`div[id*="${labelSuffix.replace("_label", "_panel")}"]`).first();
    await panel.waitFor({ state: "visible", timeout: 5000 }).catch(() => {});

    for (let i = 0; i < arrowDownCount; i++) await page.keyboard.press("ArrowDown");
    await page.keyboard.press("Enter");
    await panel.waitFor({ state: "hidden", timeout: 5000 }).catch(() => {});
    await aguardarCarregamento(page);
    await sleep(800);
  }

  // Atividade e NBS
  await selecionarDropdown("listaAtvAtd", "Serviço/Atividade", 1);
  await selecionarDropdown("listaNBS", "NBS", 4);

  // Código Indicador da Operação
  await selecionarDropdown("listaCodigoIndicadorOperacao", "Código Indicador da Operação", 1);

  // 11 TABs até Descrição do Item
  for (let i = 0; i < 11; i++) await page.keyboard.press("Tab");

  // Descrição e valor
  const desc = `${job.vehicleModel} - ${job.plate}`.toUpperCase();
  await page.fill('textarea[id$=":descricaoItem"]', desc);
  await page.fill('input[id$=":vlrUnitario_input"]', "15,00");

  // Salvar item na tabela
  await aguardarCarregamento(page);
  await page.click('button[id$=":btnAddItem"]');
  await aguardarCarregamento(page);
  await sleep(2000);

  // Reconfere CPF/CNPJ antes de submeter (AJAX de endereço pode ter limpado)
  const docValueFinal = await docInput.inputValue().catch(() => "");
  if (docValueFinal.replace(/\D/g, "") !== docLimpo) {
    log(`Documento ${docLabel} limpo durante preenchimento. Re-preenchendo...`);
    await page.evaluate(
      ([labelText, value]) => {
        const labels = Array.from(document.querySelectorAll("label"));
        const docLabel = labels.find((l) => {
          const text = (l.textContent || "").replace(/\*/g, "").trim().toUpperCase();
          return text === labelText || text.startsWith(labelText);
        });
        if (!docLabel) return;
        const forAttr = docLabel.getAttribute("for");
        let input: HTMLInputElement | null = null;
        if (forAttr) input = document.getElementById(forAttr) as HTMLInputElement | null;
        if (!input) {
          const container = docLabel.closest("tr, td, div, fieldset, .ui-panelgrid-cell");
          input = container?.querySelector("input, textarea") as HTMLInputElement | null;
        }
        if (!input) return;
        input.value = value;
        input.dispatchEvent(new Event("focus", { bubbles: true }));
        input.dispatchEvent(new Event("input", { bubbles: true }));
        input.dispatchEvent(new Event("change", { bubbles: true }));
        input.dispatchEvent(new Event("blur", { bubbles: true }));
      },
      [docLabel, docFormatted] as const,
    );
    await sleep(1000);
  }

  await page.click('button[id$=":btnDefault"]');

  await confirmarSim(page);
  await sleep(3000);

  // Verifica mensagens de erro na página
  const erros = await page.evaluate(() => {
    const text = document.body.innerText || "";
    const errorKeywords = ["Informe o", "Campo obrigatório", "não é válido", "erro", "inválido"];
    const found = errorKeywords.filter((k) => text.toLowerCase().includes(k.toLowerCase()));
    return found;
  });
  if (erros.length > 0) {
    throw new Error(`Erro na emissão detectado: ${erros.join(", ")}`);
  }

  // Aguarda tela de sucesso com indicadores que só aparecem após emissão real
  const sucessoPromise = Promise.race([
    page.waitForSelector('text="Dados da NFS-e emitida"', { state: "visible", timeout: 30000 }),
    page.waitForSelector('text="A NFS-e foi emitida com sucesso"', { state: "visible", timeout: 30000 }),
    page.waitForSelector('text="emitida com sucesso"', { state: "visible", timeout: 30000 }),
  ]);
  await sucessoPromise.catch(() => {});
  await sleep(1500);

  // Tira print da tela após emissão
  const sucessoStamp = new Date().toISOString().replace(/[:.]/g, "-").slice(11, 19);
  await page.screenshot({ path: path.join(os.tmpdir(), `sucesso_${job.plate}_${sucessoStamp}.png`) }).catch(() => {});

  // Captura o número da nota. Evita capturar o número de preview/"próxima NFS-e".
  const numeroNota = await page.evaluate((lastNumber) => {
    const text = document.body.innerText || "";
    // Remove linhas de preview para não capturar número futuro
    const cleanText = text.replace(/A pr[oó]xima NFS-e ter[áa] o n[úu]mero\s*\d+/gi, "");
    const matches = Array.from(cleanText.matchAll(/N[uú]mero:\s*(\d+)/gi)).map((m) => m[1]);
    if (!matches.length) return null;

    // Se há vários números, prefere um diferente do anterior (novo)
    if (lastNumber && matches.length > 1) {
      const novo = matches.slice().reverse().find((n) => n !== lastNumber);
      if (novo) return novo;
    }
    return matches[matches.length - 1];
  }, lastNumber);

  if (!numeroNota) throw new Error("Não foi possível capturar o número da nota.");

  log(`SUCESSO: Nota ${numeroNota} capturada para ${job.plate}`);
  return numeroNota;
}

async function confirmarSim(page: Page) {
  await aguardarCarregamento(page);
  try {
    await page.waitForSelector('button[id="frmActions:j_idt480"]', { state: "visible", timeout: 10000 });
    await page.click('button[id="frmActions:j_idt480"]');
    return;
  } catch {}

  await page.waitForSelector('button:has-text("Sim"):visible, .ui-confirmdialog-yes:visible', { timeout: 10000 });
  await page.locator('button:has-text("Sim"):visible, .ui-confirmdialog-yes:visible').first().click();
}

async function prepararProximaNota(page: Page) {
  try {
    await page.click('button:has-text("Nova NFS-e")');
    await sleep(3000);
    return;
  } catch {}
  const emissaoUrl = envOr(
    "PREFEITURA_EMISSAO_URL",
    "http://pradopolis.ddns.net:5661/issweb/paginas/admin/notafiscal/convencional/emissaopadrao",
  );
  await page.goto(emissaoUrl, { waitUntil: "domcontentloaded", timeout: 30000 });
  await sleep(5000);
}

async function initPortal(page: Page) {
  const loginUrl = requiredEnv("PREFEITURA_LOGIN_URL");
  const username = requiredEnv("PREFEITURA_USERNAME");
  const password = requiredEnv("PREFEITURA_PASSWORD");
  const cnpj = requiredEnv("PREFEITURA_CNPJ");

  log("Fazendo login no sistema...");
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

  log("Navegando para emissão de notas...");
  await page.waitForSelector('#navNfse > a', { state: "visible", timeout: 15000 });
  await page.locator('#navNfse > a').click();
  await sleep(1000);
  await page.waitForSelector('text="Emitir NFS-e"', { state: "visible", timeout: 10000 });
  await page.click('text="Emitir NFS-e"');
  await aguardarCarregamento(page);
  await sleep(2000);
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

async function updateJob(input: { jobId: string; status: "EMITIDA" | "LANCADO" | "ERRO"; nfseNumber?: string; errorMessage?: string }) {
  const baseUrl = requiredEnv("APP_BASE_URL").replace(/\/+$/, "");
  const apiKey = requiredEnv("ROBOT_API_KEY");

  const tentar = async (payload: typeof input) => {
    return fetch(`${baseUrl}/api/robot/update`, {
      method: "POST",
      headers: { "content-type": "application/json", "x-api-key": apiKey },
      body: JSON.stringify(payload),
    });
  };

  let res = await tentar(input);

  if (!res.ok && input.status === "LANCADO" && res.status === 400) {
    log("API ainda não aceita LANCADO; gravando como EMITIDA temporariamente");
    res = await tentar({ ...input, status: "EMITIDA" });
  }

  if (!res.ok && res.status >= 500) {
    log(`API retornou ${res.status}; tentando novamente em 3s...`);
    await sleep(3000);
    res = await tentar(res.status === 400 && input.status === "LANCADO" ? { ...input, status: "EMITIDA" } : input);
  }

  if (!res.ok) throw new Error(`Falha /api/robot/update: ${res.status}`);
}

async function runSession(singleJob: boolean) {
  const headless = process.env.ROBOT_HEADLESS !== "0";
  const browser = await chromium.launch({ headless, slowMo: headless ? 0 : 1000 });
  const context = await browser.newContext({ viewport: { width: 1366, height: 768 } });
  const page = await context.newPage();

  const emissaoUrl = envOr(
    "PREFEITURA_EMISSAO_URL",
    "http://pradopolis.ddns.net:5661/issweb/paginas/admin/notafiscal/convencional/emissaopadrao",
  );

  try {
    await initPortal(page);
    let lastNumber: string | null = null;

    for (;;) {
      const next = await fetchNextJob();
      if (!next.job) {
        log("Sem job na fila.");
        break;
      }

      try {
        let numero = await processarNota(page, next.job, lastNumber);

        if (lastNumber && numero === lastNumber) {
          log(`AVISO: número ${numero} igual ao anterior. Recarregando e tentando novamente.`);
          await page.goto(emissaoUrl, { waitUntil: "domcontentloaded", timeout: 30000 }).catch(() => {});
          await sleep(5000);
          numero = await processarNota(page, next.job, null);
          if (numero === lastNumber) {
            throw new Error(`Número da nota repetido (${numero}). Portal pode estar em estado inconsistente.`);
          }
        }
        lastNumber = numero;

        await updateJob({ jobId: next.job.jobId, status: "LANCADO", nfseNumber: numero });
        process.stdout.write(`Job ${next.job.jobId} concluído. Nota ${numero}.\n`);

        if (singleJob) break;

        await prepararProximaNota(page);
      } catch (e) {
        const msg = e instanceof Error ? e.message : String(e);
        const curto = msg.split("\n")[0].slice(0, 80);
        await updateJob({ jobId: next.job.jobId, status: "ERRO", errorMessage: msg.slice(0, 500) });
        process.stderr.write(`Job ${next.job.jobId} falhou: ${curto}\n`);

        const stamp = new Date().toISOString().replace(/[:.]/g, "-").slice(11, 19);
        const imgPath = path.join(os.tmpdir(), `erro_${next.job.plate}_${stamp}.png`);
        await page.screenshot({ path: imgPath }).catch(() => {});
        log(`Screenshot: ${imgPath}`);

        if (singleJob) break;

        log("Recarregando página de emissão para próxima nota...");
        await page.goto(emissaoUrl, { waitUntil: "domcontentloaded", timeout: 30000 }).catch(() => {});
        await sleep(5000);
      }
    }
  } finally {
    await context.close();
    await browser.close();
  }
}

async function main() {
  const runOnceMode = process.env.ROBOT_RUN_ONCE === "1";
  await runSession(runOnceMode);
}

main().catch((e) => {
  process.stderr.write(String(e) + "\n");
  process.exit(1);
});
