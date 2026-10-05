// Screen-follow: share a (fake) screen, the first tutor request carries the frame, and Teacher's
// screenMark is drawn over the snapshot. Muted. Run against the mock with a scripted turn:
//   MOCK_TURNS=scripts/mock-turns-screen.json node scripts/mock-anthropic.mjs 4010 /tmp/mock.log &
//   ANTHROPIC_API_KEY=test ANTHROPIC_BASE_URL=http://localhost:4010 npm start
//   node scripts/e2e-screen.mjs /tmp /tmp/mock.log
import { chromium } from "playwright";
import { readFileSync } from "node:fs";
const OUT = process.argv[2] || ".";
const LOG = process.argv[3];
const BASE = process.env.BASE_URL || "http://localhost:3000";
const browser = await chromium.launch({ executablePath: "/opt/pw-browsers/chromium", args: ["--mute-audio"] }).catch(() => chromium.launch({ args: ["--mute-audio"] }));
const fail = (m) => {
  console.error("FAIL:", m);
  process.exitCode = 1;
};
try {
  const page = await browser.newPage({ viewport: { width: 1360, height: 900 } });
  const errors = [];
  page.on("pageerror", (e) => errors.push(e.message));
  // Stand-in for the browser's "choose what to share" picker: a canvas showing a homework problem.
  await page.addInitScript(() => {
    navigator.mediaDevices.getDisplayMedia = async () => {
      const c = document.createElement("canvas");
      c.width = 1280;
      c.height = 720;
      const g = c.getContext("2d");
      const paint = () => {
        g.fillStyle = "#fff";
        g.fillRect(0, 0, c.width, c.height);
        g.fillStyle = "#123";
        g.font = "64px sans-serif";
        g.fillText("Solve: 2x + 5 = 17", 380, 380);
      };
      paint();
      setInterval(paint, 200);
      return c.captureStream(5);
    };
  });
  await page.goto(BASE);
  await page.getByRole("button", { name: /Help with what's on my screen/ }).click();
  await page.getByRole("button", { name: /Start with Teacher/ }).click();
  await page.getByRole("button", { name: /Share my screen/ }).click();
  await page.waitForSelector(".screen-frame img", { timeout: 20000 });
  await page.waitForSelector(".screen-mark", { timeout: 60000 });
  await page.waitForTimeout(1200);
  await page.screenshot({ path: `${OUT}/s1-screen.png` });
  const marks = await page.locator(".screen-mark").count();
  console.log("screen marks drawn:", marks, "| caption:", (await page.locator(".caption").innerText()).slice(0, 70));
  if (marks < 1) fail("no screen mark");
  if (LOG) {
    const req = readFileSync(LOG, "utf8").trim().split("\n").map((l) => JSON.parse(l)).find((l) => "image" in l);
    console.log("first tutor request carried an image:", req?.image);
    if (!req?.image) fail("the screen frame wasn't sent");
  }
  console.log("page errors:", errors.length ? errors : "none");
  if (errors.length) fail("page errors");
} finally {
  await browser.close();
}
