import { chromium } from "playwright";
const SP = process.argv[2];
const demo = process.argv[3] || "Algebra";
const browser = await chromium.launch({ executablePath: "/opt/pw-browsers/chromium" }).catch(() => chromium.launch());
const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
const errors = [];
page.on("pageerror", (e) => errors.push("pageerror: " + e.message + " | " + (e.stack || "").split("\n").slice(0, 3).join(" | ")));
page.on("requestfailed", (r) => errors.push("requestfailed: " + r.url() + " " + (r.failure()?.errorText || "")));
page.on("console", (m) => m.type() === "error" && errors.push("console: " + m.text()));
await page.goto("http://localhost:3000");
await page.waitForTimeout(800);
await page.screenshot({ path: `${SP}/01-home.png`, fullPage: true });
const btn = { Algebra: /Algebra/, Accounting: /ACCT/, Chemistry: /CHEM/, Economics: /ECON/ }[demo];
await page.getByRole("button", { name: btn }).first().click();
await page.waitForTimeout(400);
await page.screenshot({ path: `${SP}/02-pick-${demo}.png` });
await page.getByRole("radio").first().click();
await page.getByRole("button", { name: /Start with Teacher/ }).click();
await page.waitForTimeout(5000);
await page.screenshot({ path: `${SP}/03-session-${demo}.png` });
// answer through the script: click the first choice that isn't "not sure", or type answers
const answers = { Algebra: ["Subtract 7 first", "Why did we subtract first?", "Subtract 7", "15", "Divide by 3", "5", "Yes, let's go", "8"],
  Accounting: ["An asset (Prepaid Insurance)", "3 months", "Show it differently", "$3,000", "Insurance Expense", "$9,000", "1600"],
  Chemistry: ["Moles (particle counts)", "2.0 mol", "2.0 mol", "36", "90", "88"],
  Economics: ["Buyers want exactly what sellers offer", "10 = 2 + Q", "8", "6", "Both rise", "5"] }[demo];
let i = 0;
for (const a of answers) {
  i++;
  const choice = page.locator(".choice", { hasText: a });
  if (await choice.count()) await choice.first().click();
  else { await page.fill(".composer textarea", a); await page.keyboard.press("Enter"); }
  await page.waitForTimeout(4200);
  await page.screenshot({ path: `${SP}/04-${demo}-${String(i).padStart(2, "0")}.png` });
}
const caption = await page.locator(".caption").innerText();
console.log("final caption:", caption);
console.log("phase now:", await page.locator(".phases .is-now .phase-label").innerText().catch(() => "?"));
console.log("errors:", errors.length ? errors : "none");
await browser.close();
