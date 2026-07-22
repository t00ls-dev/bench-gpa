// Amostra o rótulo de período na página /area ao longo do tempo logo após o
// carregamento, para flagrar o valor "piscando"/mudando sozinho (ex.: datas
// invertidas ou reset de período assíncrono).
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
await new Promise((r) => setTimeout(r, 2000));

// Clear any persisted area filters to start fresh (mirrors a first-time visit)
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

const timeline = [];
const t0 = Date.now();
for (let i = 0; i < 30; i++) {
  const label = await readLabel();
  timeline.push({ t: Date.now() - t0, label });
  await new Promise((r) => setTimeout(r, 300));
}
console.log("Timeline (ms, label):");
for (const { t, label } of timeline) console.log(`  ${t}ms: ${label}`);

await page.screenshot({ path: `${OUT}/area-final.png` });
await browser.close();
