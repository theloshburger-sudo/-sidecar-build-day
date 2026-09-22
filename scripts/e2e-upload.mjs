// Exercises upload paths + edge states. Usage: node scripts/e2e-upload.mjs <outDir>
import { chromium } from "playwright";
import { writeFileSync } from "node:fs";
const OUT = process.argv[2] || ".";
const BASE = process.env.BASE_URL || "http://localhost:3000";
const browser = await chromium.launch({ executablePath: "/opt/pw-browsers/chromium" }).catch(() => chromium.launch());

// Build test files with the browser itself.
const maker = await browser.newPage();
await maker.setContent(`<h2>MATH 110 Homework 4</h2><p>Name: ________</p>
<p>1. Solve for x: 2(x + 3) = 14</p><p>2. Find the vertex of y = x² − 4x + 1</p><p>3. A rectangle's length is 3 more than its width. The perimeter is 26 cm. Find the width.</p>`);
writeFileSync(`${OUT}/hw.pdf`, await maker.pdf());
await maker.setContent(`<canvas id=c width=600 height=300></canvas><script>const x=c.getContext('2d');x.fillStyle='#fff';x.fillRect(0,0,600,300);x.fillStyle='#000';x.font='28px serif';x.fillText('1. Solve 5x - 4 = 21',30,80)</script>`);
const png = await maker.locator("canvas").screenshot();
writeFileSync(`${OUT}/photo.png`, png);
await maker.setContent(`<img src="data:image/png;base64,${png.toString("base64")}">`);
writeFileSync(`${OUT}/scan.pdf`, await maker.pdf());
writeFileSync(`${OUT}/bad.pdf`, "this is not a pdf");
await maker.close();

const page = await browser.newPage({ viewport: { width: 1280, height: 860 } });
const errors = [];
page.on("pageerror", (e) => errors.push(e.message));
const check = (label, ok) => console.log(`${ok ? "PASS" : "FAIL"}  ${label}`);

async function upload(file) {
  await page.goto(BASE);
  await page.locator('input[type=file]').setInputFiles(file);
  await page.waitForTimeout(3500);
}

await upload(`${OUT}/hw.pdf`);
const titles = await page.locator(".problem strong").allInnerTexts();
check(`text PDF -> ${titles.length} problems (${titles.map((t) => t.slice(0, 18)).join(" | ")})`, titles.length === 3);
await page.screenshot({ path: `${OUT}/u1-pdf-picker.png` });
await page.locator(".problem").first().click();
const live = (await (await page.request.get(`${BASE}/api/status`)).json()).live;
const startDisabled = await page.getByRole("button", { name: /Start with Teacher/ }).isDisabled();
check(`start button ${live ? "enabled (live AI)" : "disabled with explanation (no key)"}`, live ? !startDisabled : startDisabled && (await page.locator(".picker-side .alert").count()) === 1);

await upload(`${OUT}/scan.pdf`);
const scanText = live ? await page.locator(".problem strong").allInnerTexts() : [await page.locator(".alert").innerText().catch(() => "")];
check(`scanned PDF -> ${live ? "OCR problems" : "clear no-key message"}: ${scanText.join(" | ").slice(0, 90)}`, live ? scanText.length > 0 : /photos needs live AI/i.test(scanText[0]));

await upload(`${OUT}/photo.png`);
const photoText = live ? await page.locator(".problem strong").allInnerTexts() : [await page.locator(".alert").innerText().catch(() => "")];
check(`photo -> ${photoText.join(" | ").slice(0, 90)}`, photoText.join("").length > 0);

await upload(`${OUT}/bad.pdf`);
const bad = await page.locator(".alert").innerText().catch(() => "");
check(`bad PDF -> "${bad.slice(0, 70)}"`, /damaged|isn't a real PDF/i.test(bad));
await page.screenshot({ path: `${OUT}/u2-bad-file.png` });

// Paste flow
await page.goto(BASE);
await page.getByRole("button", { name: /Paste a problem/ }).click();
await page.fill(".paste textarea", "1) Factor x² + 5x + 6\n2) Solve x² = 49");
await page.getByRole("button", { name: /Use these problems/ }).click();
await page.waitForTimeout(400);
check(`paste -> ${await page.locator(".problem").count()} problems`, (await page.locator(".problem").count()) === 2);

// Focus mode + phone width on a demo
await page.goto(BASE);
await page.getByRole("button", { name: /ECON/ }).click();
await page.locator(".problem").first().click();
await page.getByRole("button", { name: /Start with Teacher/ }).click();
await page.waitForTimeout(4500);
await page.getByRole("button", { name: /Focus/ }).click();
await page.waitForTimeout(300);
check("focus mode hides side panel", !(await page.locator(".side").isVisible()));
await page.screenshot({ path: `${OUT}/u3-focus.png` });
await page.setViewportSize({ width: 390, height: 844 });
await page.waitForTimeout(400);
const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
check(`phone width has no horizontal scroll (overflow ${overflow}px)`, overflow <= 1);
await page.screenshot({ path: `${OUT}/u4-phone.png`, fullPage: true });
await page.getByRole("button", { name: /Focus/ }).click();

console.log("page errors:", errors.length ? errors : "none");
await browser.close();
