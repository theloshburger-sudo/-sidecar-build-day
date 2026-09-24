// Live-session evaluator: drives real multi-turn sessions through the UI and records, per turn,
// the raw streamed /api/tutor JSON, beat-by-beat timing (caption vs strokes vs pointer), layout
// problems and errors, plus screenshots (several frames per turn, including mid-beat).
//
// Real Claude:   ANTHROPIC_API_KEY=... npx next start -p 3000 ; node scripts/e2e-live-eval.mjs out/
// Scripted turns (no key): start the app with ANTHROPIC_API_KEY=test ANTHROPIC_BASE_URL=http://localhost:4010,
//                then MOCK_PORT=4010 node scripts/e2e-live-eval.mjs out/   (replays docs/eval/sim/<session>.json)
// Pick sessions: node scripts/e2e-live-eval.mjs out/ algebra clock
import { chromium } from "playwright";
import { spawn } from "node:child_process";
import { mkdirSync, writeFileSync } from "node:fs";

const OUT = process.argv[2] || "eval-out";
const only = process.argv.slice(3);
const BASE = process.env.BASE_URL || "http://localhost:3000";
const MOCK_PORT = process.env.MOCK_PORT;
const TURN_TIMEOUT = Number(process.env.TURN_TIMEOUT || 150_000);

export const SESSIONS = [
  { name: "algebra", problem: "Solve for x: 3x + 7 = 22", answers: ["I don't know how to start", "29", "why do we subtract 7?", "15", "x = 5"] },
  {
    name: "accounting",
    problem: "On Oct 1 a company paid $12,000 for a 12-month insurance policy. What adjusting entry is needed on Dec 31?",
    answers: ["Which accounts do I use?", "2 months, so 2,000", "3,000", "can you show it differently?", "9,000"],
  },
  {
    name: "econ",
    problem: "Demand P = 10 − 0.5Q, supply P = 2 + 0.5Q. Find the equilibrium and show it on a graph.",
    answers: ["How do I find equilibrium?", "Q = 10?", "Q = 8", "surplus"],
  },
  {
    name: "externality",
    problem: "A factory's pollution imposes $2 per unit on neighbors. Show how the market quantity compares to the social optimum.",
    answers: ["How do I draw it?", "Q = 10?", "Q = 6", "because the factory doesn't pay for the pollution"],
  },
  {
    name: "history",
    problem: "How did the alliance system turn the assassination of Franz Ferdinand into a world war?",
    answers: [
      "What's the alliance system?",
      "Russia, they got their army ready",
      "why did Germany go through Belgium though?",
      "the alliances meant every country that got attacked pulled its allies in, so it spread",
    ],
  },
  { name: "clock", problem: "draw a clock to explain why i^4 = 1", answers: ["at i, 3 o'clock", "i?", "−i"] },
];

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

function startMock(name) {
  const p = spawn(process.execPath, ["scripts/mock-anthropic.mjs", MOCK_PORT], {
    env: { ...process.env, MOCK_TURNS: `docs/eval/sim/${name}.json` },
    stdio: ["ignore", "pipe", "inherit"],
  });
  return new Promise((resolve, reject) => {
    p.stdout.once("data", () => resolve(p));
    p.once("exit", (code) => reject(new Error(`mock exited (${code}); is port ${MOCK_PORT} busy?`)));
  });
}

/** Everything we measure from the page at one instant. Board coordinates (viewBox units). */
async function probe(page) {
  return page.evaluate(() => {
    const svg = document.querySelector(".wb-svg");
    const now = document.querySelector(".beat--now");
    const bbox = (el) => {
      try {
        const b = el.getBBox();
        return { x: b.x, y: b.y, w: b.width, h: b.height };
      } catch {
        return null;
      }
    };
    const inPointer = (el) => el.closest(".wb-pointer, .wb-marker, .wb-tags, .wb-ink");
    const texts = svg ? [...svg.querySelectorAll("text.wb-text")].filter((t) => !inPointer(t)) : [];
    const paths = svg ? [...svg.querySelectorAll("path, rect.wb-fill")].filter((p) => !inPointer(p)) : [];
    const ptr = svg?.querySelector(".wb-pointer");
    const bubble = ptr?.querySelector(".wb-pointer-bubble rect");
    const ring = ptr?.querySelector(".wb-pointer-ring");
    const alert = document.querySelector('[role="alert"]');
    return {
      beatIdx: now ? Number(now.getAttribute("data-beat") ?? 0) : -1,
      beatText: now?.textContent ?? "",
      strokes: texts.length + paths.length,
      texts: texts.map((t) => ({ s: t.textContent, b: bbox(t) })),
      tags: svg ? [...svg.querySelectorAll(".wb-tag")].map((g) => bbox(g)) : [],
      pointer: ptr
        ? {
            label: ptr.querySelector(".wb-pointer-bubble text")?.textContent ?? "",
            bubble: bubble ? bbox(bubble) : null,
            ring: ring ? bbox(ring) : null,
            flying: !ring,
          }
        : null,
      alert: alert?.textContent?.trim() ?? "",
      tutorMsgs: document.querySelectorAll(".msg--tutor").length,
      viewBoxW: svg ? svg.viewBox.baseVal.width : 1000,
    };
  });
}

/** Beats in a raw reply: narrate lines and the actions drawn under each (pointTo counted separately). */
function beatsOf(body) {
  try {
    const board = JSON.parse(body).board ?? [];
    const out = [];
    for (const a of board) {
      if (a.type === "narrate" || !out.length) out.push({ say: a.type === "narrate" ? a.text : "", draw: 0, point: 0 });
      if (a.type === "pointTo") out[out.length - 1].point++;
      else if (a.type !== "narrate") out[out.length - 1].draw++;
    }
    return out.map((b) => `${b.draw}d${b.point ? `+${b.point}p` : ""}`).join(" ");
  } catch {
    return "unparseable";
  }
}

const area = (a, b) => Math.max(0, Math.min(a.x + a.w, b.x + b.w) - Math.max(a.x, b.x)) * Math.max(0, Math.min(a.y + a.h, b.y + b.h) - Math.max(a.y, b.y));

/** Layout problems visible on the final board of a turn. */
function layoutIssues(s) {
  const issues = [];
  const t = s.texts.filter((x) => x.b && x.b.w > 0 && x.s.trim());
  for (let i = 0; i < t.length; i++) {
    for (let j = i + 1; j < t.length; j++) {
      const ov = area(t[i].b, t[j].b);
      if (ov > 0.25 * Math.min(t[i].b.w * t[i].b.h, t[j].b.w * t[j].b.h)) issues.push(`text overlap: "${t[i].s}" × "${t[j].s}"`);
    }
    if (t[i].b.x < 0 || t[i].b.x + t[i].b.w > s.viewBoxW + 1) issues.push(`off board: "${t[i].s}" (x ${Math.round(t[i].b.x)}–${Math.round(t[i].b.x + t[i].b.w)})`);
    if (/[\^\\{}]|�|\$\$/.test(t[i].s)) issues.push(`raw markup: "${t[i].s}"`);
  }
  for (const g of s.tags) for (const x of t) if (g && area(g, x.b) > 60) issues.push(`badge on text: "${x.s}"`);
  return [...new Set(issues)];
}

async function runSession(browser, sess) {
  const dir = `${OUT}/${sess.name}`;
  mkdirSync(dir, { recursive: true });
  const mock = MOCK_PORT ? await startMock(sess.name) : null;
  const page = await browser.newPage({ viewport: { width: 1360, height: 880 } });
  try {
    return await drive(page, sess, dir);
  } finally {
    await page.close().catch(() => {});
    mock?.kill();
  }
}

async function drive(page, sess, dir) {
  const errors = [];
  const raws = [];
  page.on("pageerror", (e) => errors.push(`pageerror: ${e.message}`));
  page.on("console", (m) => m.type() === "error" && !/tts|Failed to load resource/i.test(m.text()) && errors.push(`console: ${m.text().slice(0, 200)}`));
  page.on("requestfailed", (r) => !/\/api\/(tts|tutor)/.test(r.url()) && errors.push(`requestfailed: ${r.url()} ${r.failure()?.errorText}`));
  // CDP can't hand back a streamed body, so tee /api/tutor inside the page (with time to first byte).
  await page.exposeFunction("__evalRaw", (rec) => {
    raws.push(rec);
    if (rec.status >= 400) errors.push(`/api/tutor ${rec.status}: ${rec.body.slice(0, 200)}`);
  });
  await page.addInitScript(() => {
    const orig = window.fetch;
    window.fetch = async (...args) => {
      const t0 = performance.now();
      const res = await orig(...args);
      if (!String(args[0]).includes("/api/tutor")) return res;
      const [a, b] = res.body ? res.body.tee() : [null, null];
      (async () => {
        let body = "";
        let firstByteMs = null;
        if (b) {
          const rd = b.getReader();
          const dec = new TextDecoder();
          for (;;) {
            const { value, done } = await rd.read();
            if (done) break;
            if (firstByteMs === null) firstByteMs = Math.round(performance.now() - t0);
            body += dec.decode(value, { stream: true });
          }
        }
        window.__evalRaw({ status: res.status, body, firstByteMs, totalMs: Math.round(performance.now() - t0) });
      })();
      return new Response(a, { status: res.status, statusText: res.statusText, headers: res.headers });
    };
  });

  await page.goto(BASE, { waitUntil: "networkidle" });
  // A click before React hydrates does nothing: retry until the paste box opens.
  for (let i = 0; i < 10 && !(await page.locator(".paste textarea").count()); i++) {
    await page.getByRole("button", { name: /Paste a problem/ }).click();
    await page.waitForTimeout(500);
  }
  await page.fill(".paste textarea", sess.problem);
  await page.getByRole("button", { name: /Use these problems/ }).click();
  await page.getByRole("button", { name: /Start with Teacher/ }).click();

  const turns = [];
  const messages = [null, ...sess.answers];
  for (let k = 0; k < messages.length; k++) {
    const msg = messages[k];
    const rawsBefore = raws.length;
    const t0 = Date.now();
    if (msg !== null) {
      const choice = page.locator(".choice", { hasText: msg });
      if (await choice.count()) await choice.first().click();
      else {
        await page.fill(".composer textarea, .composer input", msg);
        await page.locator(".composer button[type=submit]").click();
      }
    }
    // Sample until the turn has finished playing (new tutor message, no beat being spoken).
    const samples = [];
    let firstBeatMs = null;
    let lastBeat = -2;
    let shot = 0;
    let done = false;
    while (Date.now() - t0 < TURN_TIMEOUT) {
      const s = await probe(page);
      const t = Date.now() - t0;
      // What the label covers right now (text written later in the turn doesn't count: the pointer is gone by then).
      const covers = [];
      const bub = s.pointer && !s.pointer.flying ? s.pointer.bubble : null;
      if (bub) for (const tx of s.texts) if (tx.b && area(bub, tx.b) > 40) covers.push(`"${s.pointer.label}" covers "${tx.s}"`);
      samples.push({ t, beatIdx: s.beatIdx, strokes: s.strokes, pointer: s.pointer, alert: s.alert, covers });
      if (s.beatIdx >= 0 && firstBeatMs === null) firstBeatMs = t;
      if (s.beatIdx !== lastBeat && s.beatIdx >= 0 && shot < 10) {
        await page.screenshot({ path: `${dir}/t${k}-beat${s.beatIdx + 1}-start.png` });
        shot++;
        // …and one mid-beat, so we can see whether the drawing happens while the line is spoken.
        setTimeout(() => page.screenshot({ path: `${dir}/t${k}-beat${s.beatIdx + 1}-mid.png` }).catch(() => {}), 1100);
      }
      if (s.pointer && !s.pointer.flying && shot < 12 && !samples.slice(0, -1).some((x) => x.pointer && !x.pointer.flying && x.pointer.label === s.pointer.label && x.beatIdx === s.beatIdx)) {
        await page.screenshot({ path: `${dir}/t${k}-pointer-${s.beatIdx + 1}-${(s.pointer.label || "nolabel").replace(/[^a-z0-9]+/gi, "_")}.png` });
        shot++;
      }
      lastBeat = s.beatIdx;
      if (s.alert && /went wrong|couldn't|error|unavailable|slow down/i.test(s.alert)) break;
      const prev = samples[samples.length - 2];
      if (raws.length > rawsBefore && s.beatIdx === -1 && prev?.beatIdx === -1 && t > 600) {
        done = true;
        break;
      }
      await sleep(200);
    }
    const end = await probe(page);
    await page.screenshot({ path: `${dir}/t${k}-end.png` });
    await page.locator(".wb-scroller").screenshot({ path: `${dir}/t${k}-board.png` }).catch(() => {});

    // Per-beat: strokes drawn while the line was the current one, vs after the last line finished.
    const perBeat = {};
    for (let i = 1; i < samples.length; i++) {
      const d = samples[i].strokes - samples[i - 1].strokes;
      if (d <= 0) continue;
      // A beat's strokes only start once its line is up, so credit what appeared to the line now showing.
      const b = samples[i].beatIdx >= 0 ? samples[i].beatIdx : samples[i - 1].beatIdx >= 0 ? samples[i - 1].beatIdx : -1;
      perBeat[b] = (perBeat[b] ?? 0) + d;
    }
    // Labels type themselves out: keep only the fully typed ones (not a prefix of a longer one in the same beat).
    const seen = [...new Set(samples.filter((x) => x.pointer && !x.pointer.flying && x.pointer.label).map((x) => `${x.beatIdx + 1}:${x.pointer.label}`))];
    const pointerLabels = seen.filter((l) => !seen.some((o) => o !== l && o.startsWith(l)));
    const pointerCovers = samples.flatMap((x) => x.covers);
    turns.push({
      k,
      student: msg,
      done,
      firstBeatMs,
      apiFirstByteMs: raws[raws.length - 1]?.firstByteMs ?? null,
      apiTotalMs: raws[raws.length - 1]?.totalMs ?? null,
      totalMs: Date.now() - t0,
      alert: end.alert,
      nBeats: raws[raws.length - 1] ? beatsOf(raws[raws.length - 1].body) : null,
      strokesPerBeat: perBeat,
      strokesAfterLastBeat: perBeat[-1] ?? 0,
      pointerLabels,
      pointerCovers: [...new Set(pointerCovers)],
      layout: layoutIssues(end),
    });
    console.log(`[${sess.name}] turn ${k}${msg ? ` (“${msg}”)` : ""}: ${done ? "ok" : "NOT DONE"} first beat ${firstBeatMs}ms, total ${Date.now() - t0}ms, beats [${raws[raws.length - 1] ? beatsOf(raws[raws.length - 1].body) : "?"}], pointer ${pointerLabels.join(" | ") || "-"}${end.alert ? ` ALERT: ${end.alert}` : ""}`);
    if (!done) break;
  }
  await sleep(1300); // let the last mid-beat screenshot land
  writeFileSync(`${dir}/raw.json`, JSON.stringify(raws, null, 1));
  writeFileSync(`${dir}/metrics.json`, JSON.stringify({ session: sess.name, problem: sess.problem, errors, turns }, null, 1));
  return { session: sess.name, errors, turns };
}

const browser = await chromium.launch({ executablePath: "/opt/pw-browsers/chromium" }).catch(() => chromium.launch());
const results = [];
for (const sess of SESSIONS.filter((s) => !only.length || only.includes(s.name))) {
  try {
    results.push(await runSession(browser, sess));
  } catch (e) {
    console.error(`[${sess.name}] crashed:`, e.message);
    results.push({ session: sess.name, errors: [`harness: ${e.message}`], turns: [] });
  }
}
mkdirSync(OUT, { recursive: true });
writeFileSync(`${OUT}/summary.json`, JSON.stringify(results, null, 1));
await browser.close();
