import puppeteer from "puppeteer";

const EMAIL = "admin@gpabr.com";
const PASS = "Gpa@Manca123";
const URL = "http://localhost:8080";

const browser = await puppeteer.launch({
  executablePath: "/usr/bin/chromium",
  headless: true,
  args: ["--no-sandbox", "--disable-setuid-sandbox"],
  defaultViewport: { width: 390, height: 844 },
});

const page = await browser.newPage();

// Helper: select a single MultiSelect option by exact text match
async function selectExact(labelText, optionText) {
  // Click the trigger button
  const clicked = await page.evaluate((lbl) => {
    const labels = document.querySelectorAll("label");
    for (const lb of labels) {
      if (lb.textContent && lb.textContent.trim() === lbl) {
        const p = lb.closest("div");
        if (!p) return false;
        const b = p.querySelector("button");
        if (b) { b.click(); return true; }
      }
    }
    return false;
  }, labelText);

  if (!clicked) { console.log(`  [${labelText}] botao nao encontrado - trying fallback`); return false; }
  await new Promise(r => setTimeout(r, 2000)); // wait for dialog + options to render

  // Check if dialog appeared
  const hasDialog = await page.evaluate(() => !!document.querySelector('[role="dialog"]'));
  if (!hasDialog) {
    console.log(`  [${labelText}] dialog nao apareceu`);
    return false;
  }

  const sel = await page.evaluate((opt) => {
    const d = document.querySelector('[role="dialog"]');
    if (!d) return "no-dialog";
    const items = d.querySelectorAll('[role="option"]');
    const matches = [];
    for (const item of items) {
      matches.push(item.textContent);
      if (item.textContent && item.textContent.trim() === opt) {
        item.click();
        return "clicked-exact";
      }
    }
    // fallback: partial match 
    for (const item of items) {
      if (item.textContent && item.textContent.trim().includes(opt.trim())) {
        item.click();
        return "clicked-partial";
      }
    }
    return "not-found:" + matches.join("|");
  }, optionText);

  console.log(`  [${labelText}] "${optionText}" -> ${sel}`);
  await new Promise(r => setTimeout(r, 1500)); // wait for cascata refresh
  return sel.startsWith("clicked");
}

// Helper: list options in a MultiSelect
async function listOptions(labelText) {
  const opened = await page.evaluate((lbl) => {
    const labels = document.querySelectorAll("label");
    for (const lb of labels) {
      if (lb.textContent && lb.textContent.trim() === lbl) {
        const p = lb.closest("div");
        if (!p) return false;
        const b = p.querySelector("button");
        if (b) { b.click(); return true; }
      }
    }
    return false;
  }, labelText);

  if (!opened) return [];
  await new Promise(r => setTimeout(r, 2000));

  const opts = await page.evaluate(() => {
    const d = document.querySelector('[role="dialog"]');
    if (!d) return [];
    return Array.from(d.querySelectorAll('[role="option"]'))
      .map(o => o.textContent)
      .filter(Boolean);
  });

  // close by clicking outside
  await page.click("h1", { delay: 100 }).catch(() => {});
  await new Promise(r => setTimeout(r, 500));
  return opts;
}

async function measure(label) {
  const m = await page.evaluate(() => {
    const wrapper = document.querySelector("[data-radix-popper-content-wrapper]");
    const dialog = document.querySelector('[role="dialog"]');
    const subBtn = (() => {
      const labels = document.querySelectorAll("label");
      for (const lb of labels) {
        if (lb.textContent && lb.textContent.trim() === "Subgrupo") {
          const p = lb.closest("div");
          if (!p) return null;
          return p.querySelector("button");
        }
      }
      return null;
    })();

    const card = document.querySelector(".kpi-card");
    const cardRect = card ? card.getBoundingClientRect() : null;

    function dim(el) {
      if (!el) return null;
      const s = getComputedStyle(el);
      const r = el.getBoundingClientRect();
      return {
        offsetWidth: el.offsetWidth,
        offsetHeight: el.offsetHeight,
        rect: { left: r.left, right: r.right, top: r.top, bottom: r.bottom, width: r.width },
        w: s.width,
        minW: s.minWidth,
        maxW: s.maxWidth,
        scrollW: s.scrollWidth,
      };
    }

    return {
      windowWidth: window.innerWidth,
      card: cardRect ? { left: cardRect.left, right: cardRect.right, width: cardRect.width } : null,
      trigger: dim(subBtn),
      wrapper: dim(wrapper),
      dialog: dim(dialog),
    };
  });

  console.log(`\n=== ${label} ===`);
  console.log("Window:", m.windowWidth);
  console.log("Card:", JSON.stringify(m.card));
  console.log("Trigger:", JSON.stringify(m.trigger));
  console.log("Wrapper:", JSON.stringify(m.wrapper));
  console.log("Dialog:", JSON.stringify(m.dialog));

  if (m.card && m.wrapper) {
    const popoverRight = m.wrapper.rect.right;
    const cardRight = m.card.right;
    const popoverLeft = m.wrapper.rect.left;
    const cardLeft = m.card.left;
    console.log("---");
    console.log("Popover left:", popoverLeft, "Card left:", cardLeft, "Dentro:", popoverLeft >= cardLeft);
    console.log("Popover right:", popoverRight, "Card right:", cardRight, "Dentro:", popoverRight <= cardRight);
    console.log("OVERFLOW?", popoverRight > cardRight || popoverLeft < cardLeft);
  }
}

// ===== MAIN =====
await page.goto(URL + "/auth", { waitUntil: "domcontentloaded", timeout: 30000 });
await new Promise(r => setTimeout(r, 3000));
await page.waitForSelector("input[type=email]", { timeout: 30000 });
await page.type("input[type=email]", EMAIL);
await page.type("input[type=password]", PASS);
await page.click('button[type="submit"]');
await page.waitForSelector(".kpi-card", { timeout: 20000 });
await new Promise(r => setTimeout(r, 3000));
console.log("Logado!\n");

// Step 1: See what's available initially with no filters
// Let's see ALL dropdown options to understand the data
const allDeptos = await listOptions("Departamento");
console.log("Deptos disponiveis (" + allDeptos.length + "):", JSON.stringify(allDeptos));

// Step 2: Select Store
console.log("\n--- Selecionando Loja ---");
await selectExact("Loja", "1413 - POMPEU LOUREIRO");

// Step 3: Check deptos now
const deptosAfterStore = await listOptions("Departamento");
console.log("Deptos apos loja (" + deptosAfterStore.length + "):", JSON.stringify(deptosAfterStore));

// Step 4: Select PERECIVEIS
console.log("\n--- Selecionando Departamento ---");
const hasPereciveis = deptosAfterStore.includes("PERECIVEIS");
console.log("PERECIVEIS disponivel?", hasPereciveis);

// If not exact match, try to find it
const perecivelMatch = deptosAfterStore.find(d => d.includes("PEREC"));
console.log("Match parcial:", perecivelMatch);

await selectExact("Departamento", "PERECIVEIS");

// Step 5: Check secoes
const secoes = await listOptions("Seção");
console.log("Secoes apos depto (" + secoes.length + "):", JSON.stringify(secoes));

const secaoTarget = secoes.find(s => s.includes("FRIOS TRANSFORMADOS") || s.includes("FRIOS"));
console.log("Secao alvo:", secaoTarget);

// Step 6: Select FRIOS TRANSFORMADOS
await selectExact("Seção", "FRIOS TRANSFORMADOS");

// Step 7: Check grupos
const grupos = await listOptions("Grupo");
console.log("Grupos apos secao (" + grupos.length + "):", JSON.stringify(grupos));

const grupoTarget = grupos.find(g => g.includes("FRIO DE AVE") || g.includes("AVE"));
console.log("Grupo alvo:", grupoTarget);

await selectExact("Grupo", "FRIO DE AVE MANIPULADO +10");

// Step 8: Check subgrupos
const subgruposApres = await listOptions("Subgrupo");
console.log("Subgrupos apos grupo (" + subgruposApres.length + "):", JSON.stringify(subgruposApres));

const apreTarget = subgruposApres.find(s => s.includes("APRESUNTADO") || s.includes("APRES"));
console.log("Subgrupo alvo:", apreTarget);

// Step 9: Open Subgrupo dropdown (to measure)
console.log("\n--- Abrindo Subgrupo dropdown ---");
const opened = await page.evaluate(() => {
  const labels = document.querySelectorAll("label");
  for (const lb of labels) {
    if (lb.textContent && lb.textContent.trim() === "Subgrupo") {
      const p = lb.closest("div");
      if (!p) return false;
      const b = p.querySelector("button");
      if (b) { b.click(); return true; }
    }
  }
  return false;
});
console.log("Subgrupo opened:", opened);
await new Promise(r => setTimeout(r, 2000));

await page.screenshot({ path: "/tmp/opencode/03-dropdown-aberto.png", fullPage: true });
await measure("DROPDOWN ABERTO");

// Select APRESUNTADO if found
if (apreTarget) {
  await selectExact("Subgrupo", apreTarget);
  await new Promise(r => setTimeout(r, 1000));
  await page.screenshot({ path: "/tmp/opencode/04-apos-selecionar.png", fullPage: true });
  await measure("APÓS SELECIONAR SUBGRUPO");
} else if (subgruposApres.length > 0) {
  // pick the longest option to see if long text overflows
  const longest = subgruposApres.reduce((a, b) => (a.length > b.length ? a : b), "");
  console.log("Selecionando opcao mais longa:", longest);
  await selectExact("Subgrupo", longest);
  await new Promise(r => setTimeout(r, 1000));
  await page.screenshot({ path: "/tmp/opencode/04-opcao-longa.png", fullPage: true });
}

await browser.close();
