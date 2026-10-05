// Gap memory in guest mode (no account): a live session (scripts/mock-anthropic.mjs) records the
// missed concept on the device, Home shows it as a weak spot, and once it's due the next session
// opens with a warm-up. Run against `npm start` with the mock, plus the mock's log file:
//   node scripts/mock-anthropic.mjs 4010 /tmp/mock.log & ANTHROPIC_API_KEY=test ANTHROPIC_BASE_URL=http://localhost:4010 npm start
//   node scripts/e2e-memory.mjs /tmp /tmp/mock.log
import { chromium } from "playwright";
import { readFileSync } from "node:fs";
const OUT = process.argv[2] || ".";
const LOG = process.argv[3];
const BASE = process.env.BASE_URL || "http://localhost:3000";
const browser = await chromium.launch({ executablePath: "/opt/pw-browsers/chromium", args: ["--mute-audio"] }).catch(() => chromium.launch({ args: ["--mute-audio"] }));
const page = await browser.newPage({ viewport: { width: 1360, height: 880 } });
const errors = [];
page.on("pageerror", (e) => errors.push(e.message));
const fail = (m) => {
  console.error("FAIL:", m);
  process.exitCode = 1;
};

async function startPasted(text) {
  await page.goto(BASE);
  await page.getByRole("button", { name: /Paste a problem/ }).click();
  await page.fill(".paste textarea", text);
  await page.getByRole("button", { name: /Use these problems/ }).click();
  await page.getByRole("button", { name: /Start with Teacher/ }).click();
}

// 1. A session where Teacher names the gap (mock turn 2 carries concept "vertex-formula").
await startPasted("Find the vertex of y = x² − 4x + 1");
await page.waitForSelector(".choice", { timeout: 60000 });
await page.locator(".choice").first().click();
// The turn is recorded when Claude's reply finishes streaming, not when its bubble first appears.
await page.waitForFunction(() => localStorage.getItem("sidecar.concepts.v1"), null, { timeout: 60000 }).catch(() => {});
const concepts = await page.evaluate(() => JSON.parse(localStorage.getItem("sidecar.concepts.v1") || "[]"));
console.log("concepts on device:", concepts.map((c) => `${c.slug} misses=${c.misses} step=${c.step}`));
if (concepts.length !== 1 || concepts[0].slug !== "vertex-formula" || concepts[0].misses !== 1) fail("missed concept wasn't recorded once");

// 2. Home lists it as a weak spot, not due yet.
await page.goto(BASE);
await page.waitForSelector(".weak-spots .spot");
const spot = await page.locator(".weak-spots .spot").first().innerText();
console.log("weak spot:", spot.replace(/\s+/g, " "));
if (!/Vertex formula/.test(spot) || !/review in 2 days/.test(spot)) fail("weak spot not shown with its 2-day review");
await page.screenshot({ path: `${OUT}/m1-weak-spots.png`, fullPage: true });

// 3. Make it due, start a new session: the request must carry the warm-up and the known concepts.
await page.evaluate(() => {
  const c = JSON.parse(localStorage.getItem("sidecar.concepts.v1"));
  c[0].nextReviewAt = new Date(Date.now() - 1000).toISOString();
  localStorage.setItem("sidecar.concepts.v1", JSON.stringify(c));
});
await page.goto(BASE);
await page.waitForSelector(".spot--due button");
await page.screenshot({ path: `${OUT}/m2-due.png`, fullPage: true });
await page.locator(".spot--due button").click();
await page.getByRole("button", { name: /Start with Teacher/ }).click();
await page.waitForFunction(() => document.querySelectorAll(".msg--tutor").length >= 1, null, { timeout: 60000 });
await page.waitForTimeout(500);
if (LOG) {
  const last = readFileSync(LOG, "utf8").trim().split("\n").map((l) => JSON.parse(l)).filter((l) => "warmup" in l).at(-1);
  console.log("last tutor request:", last);
  if (!last?.warmup || !last?.knownConcepts) fail("warm-up / known concepts missing from the tutor request");
}
console.log("page errors:", errors.length ? errors : "none");
if (errors.length) fail("page errors");
await browser.close();
