import puppeteer from "puppeteer";

const IDENTIFIER = process.env.TEST_ADMIN_USERNAME || "admin";
const PASS = process.env.TEST_ADMIN_PASSWORD || "Gpa@Manca123";
const URL = process.env.TEST_APP_URL || "http://localhost:3000";

const browser = await puppeteer.launch({
  executablePath: "/usr/bin/chromium",
  headless: true,
  args: ["--no-sandbox", "--disable-setuid-sandbox"],
  defaultViewport: { width: 390, height: 844 },
});

const page = await browser.newPage();
page.on("console", (msg) => {
  if (msg.type() === "error") console.log("CONSOLE ERROR:", msg.text());
});
page.on("pageerror", (err) => console.log("PAGE ERROR:", err.message));

// Intercept requests to handle any redirects
await page.setRequestInterception(true);
page.on("request", (req) => {
  if (["image", "font", "stylesheet"].includes(req.resourceType())) {
    req.continue();
  } else {
    req.continue();
  }
});

// Helper: open a dropdown and measure
async function openDropdownAndMeasure(labelText) {
  const opened = await page.evaluate((lbl) => {
    const labels = document.querySelectorAll("label");
    for (const lb of labels) {
      if (lb.textContent && lb.textContent.trim() === lbl) {
        const p = lb.closest("div");
        if (!p) return "no-parent";
        const b = p.querySelector("button");
        if (b) {
          b.click();
          return "clicked";
        }
        return "no-button";
      }
    }
    return "no-label";
  }, labelText);
  console.log(`  Abrir "${labelText}": ${opened}`);
  await new Promise((r) => setTimeout(r, 3000));

  const m = await page.evaluate(() => {
    const wrapper = document.querySelector("[data-radix-popper-content-wrapper]");
    const dialog = document.querySelector('[role="dialog"]');
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
        overflow: s.overflow,
        overflowX: s.overflowX,
      };
    }
    // Also check if any element exceeds card
    const bodyW = document.body.scrollWidth;
    const htmlW = document.documentElement.scrollWidth;
    return {
      windowWidth: window.innerWidth,
      bodyScrollW: bodyW,
      htmlScrollW: htmlW,
      card: cardRect
        ? {
            left: cardRect.left,
            right: cardRect.right,
            width: cardRect.width,
            bottom: cardRect.bottom,
          }
        : null,
      wrapper: dim(wrapper),
      dialog: dim(dialog),
    };
  });

  console.log("  Window innerWidth:", m.windowWidth);
  console.log("  Body scrollWidth:", m.bodyScrollW, "HTML scrollWidth:", m.htmlScrollW);
  console.log("  Card:", JSON.stringify(m.card));
  console.log("  Wrapper:", JSON.stringify(m.wrapper));
  console.log("  Dialog:", JSON.stringify(m.dialog));

  if (m.card && m.wrapper) {
    console.log("  ---");
    console.log("  Wrapper right:", m.wrapper.rect.right, "Card right:", m.card.right);
    console.log("  Wrapper left:", m.wrapper.rect.left, "Card left:", m.card.left);
    console.log("  Wrapper bottom:", m.wrapper.rect.bottom, "Card bottom:", m.card.bottom);
    console.log("  Horizontal overflow?", m.wrapper.rect.right > m.card.right);
    console.log("  Vertical overflow (card)?", m.wrapper.rect.bottom > m.card.bottom);
    console.log("  Vertical overflow (window)?", m.wrapper.rect.bottom > m.windowWidth);

    // Check if page has horizontal scroll
    if (m.bodyScrollW > m.windowWidth) {
      console.log("  *** PAGE HAS HORIZONTAL SCROLL ***");
    }
  }

  return m;
}

// Navigate
console.log("Navigating to", URL + "/auth");
const resp = await page.goto(URL + "/auth", { waitUntil: "domcontentloaded", timeout: 60000 });
console.log("Status:", resp?.status());

// Wait for page to fully load
await new Promise((r) => setTimeout(r, 3000));
await page.screenshot({ path: "/tmp/test-production/prod-00-auth.png", fullPage: true });

// Login
console.log("\nLogging in...");
await page.waitForSelector("#identifier", { timeout: 30000 });
await page.type("#identifier", IDENTIFIER);
await page.type("input[type=password]", PASS);
await page.click('button[type="submit"]');

// Wait for dashboard
try {
  await page.waitForSelector(".kpi-card", { timeout: 30000 });
  console.log("Dashboard loaded!");
} catch (e) {
  console.log("Timeout waiting for dashboard. Current URL:", page.url());
  await page.screenshot({ path: "/tmp/test-production/prod-01-login-error.png", fullPage: true });
  const html = await page.content();
  console.log("HTML snippet:", html.substring(0, 2000));
  await browser.close();
  process.exit(1);
}

await new Promise((r) => setTimeout(r, 3000));
await page.screenshot({ path: "/tmp/test-production/prod-01-dashboard.png", fullPage: true });
console.log("Page URL:", page.url());

// List initial options
console.log("\n--- Opening Subgrupo dropdown (no filters) ---");
await openDropdownAndMeasure("Subgrupo");
await page.screenshot({ path: "/tmp/test-production/prod-02-subgrupo-aberto.png", fullPage: true });

// Close the dropdown
await page.evaluate(() => {
  // Click outside to close
  const h1 = document.querySelector("h1");
  if (h1) h1.click();
});
await new Promise((r) => setTimeout(r, 500));

console.log("\n--- Selecting filters ---");
// Try selecting the cascade
async function selectFilter(labelText, value) {
  console.log(`\nSelecting "${labelText}" = "${value}"`);
  // Open the dropdown
  const opened = await page.evaluate((lbl) => {
    const labels = document.querySelectorAll("label");
    for (const lb of labels) {
      if (lb.textContent && lb.textContent.trim() === lbl) {
        const p = lb.closest("div");
        if (!p) return false;
        const b = p.querySelector("button");
        if (b) {
          b.click();
          return true;
        }
      }
    }
    return false;
  }, labelText);
  if (!opened) {
    console.log("  Failed to open");
    return false;
  }
  await new Promise((r) => setTimeout(r, 2000));

  // Try selecting
  const result = await page.evaluate((opt) => {
    const d = document.querySelector('[role="dialog"]');
    if (!d) return "no-dialog";
    const items = d.querySelectorAll('[role="option"]');
    // Exact match first
    for (const item of items) {
      if (item.textContent && item.textContent.trim() === opt) {
        item.click();
        return "exact";
      }
    }
    // Partial match
    for (const item of items) {
      if (item.textContent && item.textContent.trim().includes(opt)) {
        item.click();
        return "partial:" + item.textContent;
      }
    }
    // Show available options
    const opts = Array.from(items)
      .map((i) => i.textContent)
      .filter(Boolean);
    return "not-found. Options: " + JSON.stringify(opts);
  }, value);

  console.log("  Result:", result);
  await new Promise((r) => setTimeout(r, 2000));
  return result.startsWith("exact") || result.startsWith("partial");
}

// Let's see what departments and sections are available first
const deptos = await page.evaluate(() => {
  const labels = document.querySelectorAll("label");
  for (const lb of labels) {
    if (lb.textContent && lb.textContent.trim() === "Departamento") {
      const p = lb.closest("div");
      if (!p) return [];
      const b = p.querySelector("button");
      if (!b) return [];
      b.click();
      return [];
    }
  }
  return [];
});
await new Promise((r) => setTimeout(r, 2000));
const deptoOpts = await page.evaluate(() => {
  const d = document.querySelector('[role="dialog"]');
  if (!d) return [];
  return Array.from(d.querySelectorAll('[role="option"]'))
    .map((o) => o.textContent)
    .filter(Boolean);
});
console.log("\nDepartamentos:", JSON.stringify(deptoOpts));

// Close
await page.evaluate(() => {
  document.querySelector("h1")?.click();
});
await new Promise((r) => setTimeout(r, 500));

// Now do the full cascade
await selectFilter("Departamento", "PERECIVEIS");
await page.screenshot({
  path: "/tmp/test-production/prod-03-selecionou-departamento.png",
  fullPage: true,
});

// Check secoes
const secaoOpts = await page.evaluate(() => {
  const labels = document.querySelectorAll("label");
  for (const lb of labels) {
    if (lb.textContent && lb.textContent.trim() === "Seção") {
      const p = lb.closest("div");
      if (!p) return [];
      const b = p.querySelector("button");
      if (!b) return [];
      b.click();
    }
  }
  setTimeout(() => {}, 2000);
  return [];
});
await new Promise((r) => setTimeout(r, 2000));
const secaoList = await page.evaluate(() => {
  const d = document.querySelector('[role="dialog"]');
  if (!d) return [];
  return Array.from(d.querySelectorAll('[role="option"]'))
    .map((o) => o.textContent)
    .filter(Boolean);
});
console.log("\nSecoes:", JSON.stringify(secaoList));
await page.evaluate(() => {
  document.querySelector("h1")?.click();
});
await new Promise((r) => setTimeout(r, 500));

// Continue cascade
await selectFilter("Seção", "FRIOS TRANSFORMADOS");

const grupoOpts = await page.evaluate(() => {
  const labels = document.querySelectorAll("label");
  for (const lb of labels) {
    if (lb.textContent && lb.textContent.trim() === "Grupo") {
      const p = lb.closest("div");
      if (!p) return [];
      const b = p.querySelector("button");
      if (!b) return [];
      b.click();
    }
  }
  setTimeout(() => {}, 2000);
  return [];
});
await new Promise((r) => setTimeout(r, 2000));
const grupoList = await page.evaluate(() => {
  const d = document.querySelector('[role="dialog"]');
  if (!d) return [];
  return Array.from(d.querySelectorAll('[role="option"]'))
    .map((o) => o.textContent)
    .filter(Boolean);
});
console.log("\nGrupos:", JSON.stringify(grupoList));
await page.evaluate(() => {
  document.querySelector("h1")?.click();
});
await new Promise((r) => setTimeout(r, 500));

await selectFilter("Grupo", "FRIO DE AVE MANIPULADO +10");

await page.screenshot({
  path: "/tmp/test-production/prod-04-selecionou-grupo.png",
  fullPage: true,
});

// Check subgrupos
const subOpts = await page.evaluate(() => {
  const labels = document.querySelectorAll("label");
  for (const lb of labels) {
    if (lb.textContent && lb.textContent.trim() === "Subgrupo") {
      const p = lb.closest("div");
      if (!p) return [];
      const b = p.querySelector("button");
      if (!b) return [];
      b.click();
    }
  }
  setTimeout(() => {}, 2000);
  return [];
});
await new Promise((r) => setTimeout(r, 2000));
const subList = await page.evaluate(() => {
  const d = document.querySelector('[role="dialog"]');
  if (!d) return [];
  return Array.from(d.querySelectorAll('[role="option"]'))
    .map((o) => o.textContent)
    .filter(Boolean);
});
console.log("\nSubgrupos:", JSON.stringify(subList));

// Now measure the Subgrupo dropdown while open
await page.screenshot({ path: "/tmp/test-production/prod-05-subgrupo-aberto.png", fullPage: true });
const m = await page.evaluate(() => {
  const wrapper = document.querySelector("[data-radix-popper-content-wrapper]");
  const dialog = document.querySelector('[role="dialog"]');
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
      maxW: s.maxWidth,
    };
  }
  return {
    windowWidth: window.innerWidth,
    card: cardRect
      ? {
          left: cardRect.left,
          right: cardRect.right,
          width: cardRect.width,
          bottom: cardRect.bottom,
        }
      : null,
    wrapper: dim(wrapper),
    dialog: dim(dialog),
    bodyScrollW: document.body.scrollWidth,
    htmlScrollW: document.documentElement.scrollWidth,
  };
});
console.log("\n=== FINAL MEASUREMENT ===");
console.log("Window:", m.windowWidth, "Body scrollW:", m.bodyScrollW);
console.log("Card:", JSON.stringify(m.card));
console.log("Wrapper:", JSON.stringify(m.wrapper));
console.log("Dialog:", JSON.stringify(m.dialog));
if (m.card && m.wrapper) {
  console.log("Overflow right?", m.wrapper.rect.right > m.card.right);
  console.log("Overflow left?", m.wrapper.rect.left < m.card.left);
  console.log("Overflow bottom (card)?", m.wrapper.rect.bottom > m.card.bottom);
  console.log("Overflow bottom (window)?", m.wrapper.rect.bottom > m.windowWidth);
}
if (m.bodyScrollW > m.windowWidth) {
  console.log("*** PAGE HAS HORIZONTAL SCROLL ***");
}

await browser.close();
