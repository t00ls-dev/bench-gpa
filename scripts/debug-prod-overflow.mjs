import puppeteer from "puppeteer";

const EMAIL = "admin@gpabr.com";
const PASS = "Gpa@Manca123";
const URL = "https://bench-gpa.vercel.app";

async function runTest(viewportWidth) {
  const browser = await puppeteer.launch({
    executablePath: "/usr/bin/chromium",
    headless: true,
    args: ["--no-sandbox", "--disable-setuid-sandbox"],
    defaultViewport: { width: viewportWidth, height: 844 },
  });

  const page = await browser.newPage();
  const consoleErrors = [];
  page.on("console", (msg) => {
    if (msg.type() === "error") consoleErrors.push(msg.text());
  });
  page.on("pageerror", (err) => consoleErrors.push(err.message));

  // Login
  await page.goto(URL + "/auth", { waitUntil: "domcontentloaded", timeout: 60000 });
  await new Promise(r => setTimeout(r, 3000));
  await page.waitForSelector("input[type=email]", { timeout: 30000 });
  await page.type("input[type=email]", EMAIL);
  await page.type("input[type=password]", PASS);
  await page.click('button[type="submit"]');
  await page.waitForSelector(".kpi-card", { timeout: 30000 });
  await new Promise(r => setTimeout(r, 3000));

  // Helper: click outside to close any open popover
  async function closePopover() {
    await page.evaluate(() => {
      // Click on the page background
      document.body.click();
    });
    await new Promise(r => setTimeout(r, 500));
  }

  // Helper: select a filter by label and option text
  async function selectFilter(labelText, optionText) {
    // First, close any existing popover
    await closePopover();

    // Click the trigger button
    await page.evaluate((lbl) => {
      const labels = document.querySelectorAll("label");
      for (const lb of labels) {
        if (lb.textContent && lb.textContent.trim() === lbl) {
          const p = lb.closest("div");
          if (!p) return;
          const b = p.querySelector("button");
          if (b) b.click();
        }
      }
    }, labelText);
    await new Promise(r => setTimeout(r, 2000));

    // Select the option
    const result = await page.evaluate((opt) => {
      const d = document.querySelector('[role="dialog"]');
      if (!d) return "no-dialog";
      const items = d.querySelectorAll('[role="option"]');
      // exact match first
      for (const item of items) {
        if (item.textContent && item.textContent.trim() === opt) {
          item.click(); return "exact:" + opt;
        }
      }
      // partial match
      for (const item of items) {
        if (item.textContent && item.textContent.includes(opt)) {
          item.click(); return "partial:" + item.textContent;
        }
      }
      return "not-found";
    }, optionText);

    console.log(`  ${labelText} -> ${optionText}: ${result}`);
    await new Promise(r => setTimeout(r, 2000));
    return result;
  }

  // Step 1: Take a screenshot of the initial dashboard
  console.log(`\n=== Testing at ${viewportWidth}px ===`);
  await page.screenshot({ path: `/tmp/opencode/prod-${viewportWidth}-01-inicial.png`, fullPage: true });

  // Step 2: Check all elements for overflow
  async function checkOverflow(label) {
    const overflowData = await page.evaluate(() => {
      const results = [];
      // Check body/html scroll
      results.push({
        type: "document",
        htmlScrollW: document.documentElement.scrollWidth,
        htmlClientW: document.documentElement.clientWidth,
        bodyScrollW: document.body.scrollWidth,
        bodyClientW: document.body.clientWidth,
        windowInnerW: window.innerWidth,
        hasHScroll: document.documentElement.scrollWidth > window.innerWidth,
      });

      // Check all elements with overflow
      const all = document.querySelectorAll("*");
      for (const el of all) {
        const s = getComputedStyle(el);
        const r = el.getBoundingClientRect();
        // Check if element is wider than viewport
        if (r.width > window.innerWidth + 2) { // 2px tolerance
          results.push({
            type: "wider-than-viewport",
            tag: el.tagName,
            cls: el.className?.slice(0, 80),
            id: el.id,
            w: r.width,
            vw: window.innerWidth,
            text: (el.textContent || "").slice(0, 60),
          });
        }
        // Check if parent has overflow hidden but element extends beyond parent
        if (el.parentElement) {
          const pr = el.parentElement.getBoundingClientRect();
          if (r.right > pr.right + 5 && pr.width > 0) {
            results.push({
              type: "overflows-parent",
              tag: el.tagName,
              cls: el.className?.slice(0, 80),
              elRight: r.right,
              parentRight: pr.right,
              diff: r.right - pr.right,
              text: (el.textContent || "").slice(0, 60),
            });
          }
        }
      }
      return results;
    });

    console.log(`\n--- ${label} ---`);
    const docData = overflowData.find(d => d.type === "document");
    if (docData) {
      console.log(`Window: ${docData.windowInnerW}px`);
      console.log(`HTML scrollW: ${docData.htmlScrollW}px, clientW: ${docData.htmlClientW}px`);
      console.log(`Body scrollW: ${docData.bodyScrollW}px, clientW: ${docData.bodyClientW}px`);
      console.log(`Horizontal scroll: ${docData.hasHScroll ? "YES ***" : "NO"}`);
    }

    const overflows = overflowData.filter(d => d.type !== "document");
    if (overflows.length > 0) {
      console.log(`Overflowing elements: ${overflows.length}`);
      overflows.slice(0, 10).forEach(o => {
        console.log(`  ${o.type}: <${o.tag}> cls="${o.cls}" text="${o.text}"`);
      });
    } else {
      console.log("No overflowing elements found");
    }

    return overflowData;
  }

  await checkOverflow("Initial state");

  // Step 3: Select the store
  console.log("\n--- Setting filters ---");
  
  // First, list all deptos to find PERECIVEIS
  const deptos = await page.evaluate(() => {
    const labels = document.querySelectorAll("label");
    for (const lb of labels) {
      if (lb.textContent && lb.textContent.trim() === "Departamento") {
        const p = lb.closest("div");
        if (!p) return [];
        const b = p.querySelector("button");
        if (b) b.click();
      }
    }
    return null;
  });
  await new Promise(r => setTimeout(r, 2000));
  const deptosList = await page.evaluate(() => {
    const d = document.querySelector('[role="dialog"]');
    if (!d) return [];
    return Array.from(d.querySelectorAll('[role="option"]')).map(o => o.textContent).filter(Boolean);
  });
  console.log("Deptos:", JSON.stringify(deptosList));
  await closePopover();

  // Select PERECIVEIS if it exists
  if (deptosList.includes("PERECIVEIS")) {
    await selectFilter("Departamento", "PERECIVEIS");
  } else {
    console.log("PERECIVEIS not found directly - trying with store first");
    // Maybe need to select store first
    await selectFilter("Loja", "1413 - POMPEU LOUREIRO");
    await selectFilter("Departamento", "PERECIVEIS");
  }

  // Try selecting section
  const secaoResult = await selectFilter("Seção", "FRIOS TRANSFORMADOS");
  console.log("Secao selecionada:", secaoResult);

  // Try selecting grupo
  const grupoResult = await selectFilter("Grupo", "FRIO DE AVE MANIPULADO +10");
  console.log("Grupo selecionado:", grupoResult);

  // Wait a bit for the cascata to settle
  await new Promise(r => setTimeout(r, 3000));

  // Take a screenshot with filters set
  await page.screenshot({ path: `/tmp/opencode/prod-${viewportWidth}-02-filters-set.png`, fullPage: true });

  // Check for overflow after filters
  await checkOverflow("After filters set");

  // Now open the Subgrupo dropdown to see the popover
  console.log("\n--- Opening Subgrupo dropdown ---");
  await closePopover();
  await page.evaluate(() => {
    const labels = document.querySelectorAll("label");
    for (const lb of labels) {
      if (lb.textContent && lb.textContent.trim() === "Subgrupo") {
        const p = lb.closest("div");
        if (!p) return;
        const b = p.querySelector("button");
        if (b) b.click();
      }
    }
  });
  await new Promise(r => setTimeout(r, 3000));

  // Take screenshot with popover open
  await page.screenshot({ path: `/tmp/opencode/prod-${viewportWidth}-03-popover-open.png`, fullPage: true });

  // Check overflow with popover open
  const overflowWithPopover = await checkOverflow("Popover open");

  // Check specific popover dimensions
  const popoverMetrics = await page.evaluate(() => {
    const wrapper = document.querySelector("[data-radix-popper-content-wrapper]");
    const dialog = document.querySelector('[role="dialog"]');
    const card = document.querySelector(".kpi-card");
    const filterBar = document.querySelector(".kpi-card.mb-6") || document.querySelector("div.kpi-card");
    const subTrigger = (() => {
      const labels = document.querySelectorAll("label");
      for (const lb of labels) {
        if (lb.textContent && lb.textContent.trim() === "Subgrupo") {
          const p = lb.closest("div");
          if (!p) return null;
          const b = p.querySelector("button");
          if (!b) return null;
          return el => {
            const r = b.getBoundingClientRect();
            return { left: r.left, right: r.right, width: r.width, offsetWidth: b.offsetWidth };
          };
        }
      }
      return null;
    })();

    function dim(el) {
      if (!el) return null;
      const r = el.getBoundingClientRect();
      return {
        left: r.left, right: r.right, top: r.top, bottom: r.bottom,
        width: r.width, height: r.height
      };
    }

    return {
      window: { width: window.innerWidth, height: window.innerHeight },
      card: dim(card),
      wrapper: dim(wrapper),
      dialog: dim(dialog),
    };
  });

  console.log("\n=== POPOVER METRICS ===");
  console.log(`Card: l=${popoverMetrics.card?.left.toFixed(0)} r=${popoverMetrics.card?.right.toFixed(0)} w=${popoverMetrics.card?.width.toFixed(0)}`);
  console.log(`Wrapper: l=${popoverMetrics.wrapper?.left.toFixed(0)} r=${popoverMetrics.wrapper?.right.toFixed(0)} w=${popoverMetrics.wrapper?.width.toFixed(0)}`);
  console.log(`Dialog: l=${popoverMetrics.dialog?.left.toFixed(0)} r=${popoverMetrics.dialog?.right.toFixed(0)} w=${popoverMetrics.dialog?.width.toFixed(0)}`);

  if (popoverMetrics.card && popoverMetrics.wrapper) {
    console.log(`\nPopover fits inside card: ${popoverMetrics.wrapper.left >= popoverMetrics.card.left && popoverMetrics.wrapper.right <= popoverMetrics.card.right}`);
    console.log(`Excess right: ${(popoverMetrics.wrapper.right - popoverMetrics.card.right).toFixed(1)}px`);
    console.log(`Excess left: ${(popoverMetrics.card.left - popoverMetrics.wrapper.left).toFixed(1)}px`);
  }

  console.log("\nConsole errors:", consoleErrors.slice(0, 5).join(" | "));
  await browser.close();
  return overflowWithPopover;
}

for (const w of [390, 375, 360]) {
  await runTest(w);
}
