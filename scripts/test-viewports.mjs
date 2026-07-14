import puppeteer from "puppeteer";

const EMAIL = "admin@gpabr.com";
const PASS = "Gpa@Manca123";
const URL = "http://localhost:8080";

async function testViewport(viewport) {
  const browser = await puppeteer.launch({
    executablePath: "/usr/bin/chromium",
    headless: true,
    args: ["--no-sandbox", "--disable-setuid-sandbox"],
    defaultViewport: viewport,
  });

  const page = await browser.newPage();
  await page.goto(URL + "/auth", { waitUntil: "domcontentloaded", timeout: 30000 });
  await new Promise(r => setTimeout(r, 3000));
  await page.waitForSelector("input[type=email]", { timeout: 30000 });
  await page.type("input[type=email]", EMAIL);
  await page.type("input[type=password]", PASS);
  await page.click('button[type="submit"]');
  await page.waitForSelector(".kpi-card", { timeout: 20000 });
  await new Promise(r => setTimeout(r, 3000));

  // Open Subgrupo dropdown (first available)
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
  if (!opened) { console.log(`[${viewport.width}x${viewport.height}] Subgrupo not found`); await browser.close(); return; }
  await new Promise(r => setTimeout(r, 2000));

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
        scrollW: s.scrollWidth,
      };
    }
    return {
      windowWidth: window.innerWidth,
      card: cardRect ? { left: cardRect.left, right: cardRect.right, width: cardRect.width } : null,
      trigger: dim(document.querySelector('[role="combobox"]')),
      wrapper: dim(wrapper),
      dialog: dim(dialog),
    };
  });

  console.log(`\n=== ${viewport.width}x${viewport.height} ===`);
  console.log("Window:", m.windowWidth);
  console.log("Card:", JSON.stringify(m.card));
  if (m.wrapper && m.card) {
    console.log("Wrapper right:", m.wrapper.rect.right, "Card right:", m.card.right);
    console.log("Wrapper left:", m.wrapper.rect.left, "Card left:", m.card.left);
    console.log("Overflow width?", m.wrapper.rect.right > m.card.right || m.wrapper.rect.left < m.card.left);
  }
  if (m.dialog && m.card) {
    console.log("Dialog right:", m.dialog.rect.right, "Card right:", m.card.right);
    console.log("Dialog left:", m.dialog.rect.left, "Card left:", m.card.left);
    console.log("Dialog bottom:", m.dialog.rect.bottom, "Card bottom:", m.card.bottom);
    console.log("Overflow bottom?", m.dialog.rect.bottom > m.card.bottom);
  }
  console.log("Dialog w:", m.dialog?.w, "maxW:", m.dialog?.maxW);
  console.log("Wrapper w:", m.wrapper?.w, "maxW:", m.wrapper?.maxW);

  await page.screenshot({ path: `/tmp/opencode/dropdown-${viewport.width}x${viewport.height}.png`, fullPage: true });
  await browser.close();
}

await testViewport({ width: 390, height: 844 }); // iPhone 14/15
await testViewport({ width: 375, height: 812 }); // iPhone X
await testViewport({ width: 360, height: 800 }); // smaller Android
await testViewport({ width: 320, height: 568 }); // iPhone SE 1st gen
