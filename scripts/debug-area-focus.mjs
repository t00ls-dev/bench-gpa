// Verifica a estabilidade do rótulo de período na página /area após a aba
// perder e recuperar o foco/visibilidade (equivalente ao app-switch no mobile).
import puppeteer from "puppeteer";
import { mkdirSync } from "node:fs";

const EMAIL = process.env.TEST_ADMIN_EMAIL || "test@gpabr.com";
const PASS = process.env.TEST_ADMIN_PASSWORD || "Gpa@Test1970";
const URL = process.env.TEST_APP_URL || "http://localhost:3000";
const OUT = process.env.SHOT_DIR || "/tmp/run-check";
mkdirSync(OUT, { recursive: true });

const browser = await puppeteer.launch({
  executablePath: "/usr/bin/chromium",
  headless: true,
  args: ["--no-sandbox", "--disable-setuid-sandbox"],
  defaultViewport: { width: 1280, height: 900 },
});
const page = await browser.newPage();
page.on("pageerror", (err) => console.log("PAGE ERROR:", err.message));

await page.goto(URL + "/auth", { waitUntil: "domcontentloaded", timeout: 60000 });
await page.waitForSelector("input[type=email]", { timeout: 30000 });
await page.type("input[type=email]", EMAIL);
await page.type("input[type=password]", PASS);
await page.click('button[type="submit"]');
await page.waitForSelector(".kpi-card", { timeout: 30000 });
await new Promise((r) => setTimeout(r, 1500));

await page.evaluate(() => {
  Object.keys(localStorage)
    .filter((k) => k.startsWith("bench-gpa:filters:area"))
    .forEach((k) => localStorage.removeItem(k));
});

async function readLabel() {
  return page.evaluate(() => {
    const btn = Array.from(document.querySelectorAll("button")).find((b) =>
      b.textContent?.match(/\d{2}\/\d{2}\/\d{2}/),
    );
    return btn?.textContent?.trim() ?? "(none)";
  });
}

await page.goto(URL + "/area", { waitUntil: "domcontentloaded" });
await new Promise((r) => setTimeout(r, 1500));
console.log("Initial:", await readLabel());

// Simulate the tab losing and regaining focus/visibility (mobile app-switch equivalent)
for (let round = 1; round <= 3; round++) {
  await page.evaluateOnNewDocument(() => {});
  await page.bringToFront();
  await page.evaluate(() => {
    Object.defineProperty(document, "visibilityState", { value: "hidden", configurable: true });
    document.dispatchEvent(new Event("visibilitychange"));
    window.dispatchEvent(new Event("blur"));
  });
  await new Promise((r) => setTimeout(r, 400));
  await page.evaluate(() => {
    Object.defineProperty(document, "visibilityState", { value: "visible", configurable: true });
    document.dispatchEvent(new Event("visibilitychange"));
    window.dispatchEvent(new Event("focus"));
  });
  await new Promise((r) => setTimeout(r, 800));
  console.log(`After focus round ${round}:`, await readLabel());
}

await page.screenshot({ path: `${OUT}/area-after-focus.png` });
await browser.close();
