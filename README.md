# Sidecar 🤖

**A private, patient AI tutor attached to the exact homework problem you're stuck on.**

Upload a Canvas assignment or study guide (PDF or a phone photo), tap the one problem you're stuck on, and **Teacher**, a friendly floating robot, asks one or two quick questions to find the concept you're actually missing. Then Teacher teaches only that, drawing it step by step on a live whiteboard. You can interrupt anytime ("why did we divide there?", "show that differently"). The session ends with a fresh related problem you solve on your own.

> Built for Build Day #1. The brief is in [`docs/BUILD_DAY_BRIEF.md`](docs/BUILD_DAY_BRIEF.md).

---

## What it does

| | |
|---|---|
| **Upload anything** | Text PDFs are read in the browser with pdf.js. Scanned PDFs and photos are read by Claude's vision. You can also paste text. |
| **Pick one problem** | The assignment is split into individual problems, and you choose exactly one. |
| **Find the gap** | 1–2 diagnostic questions (tap or type) to find the missing concept. The tutor doesn't reteach the whole chapter. |
| **Live whiteboard** | Claude returns structured board actions (`write`, `circle`, `balance`, `graph`, `plot`, `tAccount`, `timeline`, `table`...). A layout engine positions them, and a marker (carried by a mini Teacher) draws them stroke by stroke. |
| **Interrupt anytime** | Type, use the mic, or tap *Why? / Show it differently / Slow down / Give me an example*. Drawing stops, and Teacher answers that exact question and then checks understanding. |
| **Never just the answer** | Teacher teaches the next idea and makes you do the step. The session ends with a *different* related problem that gets graded. |
| **Focus Mode** | Shows only the board, the current question and a progress meter. |
| **Your pace, your format** | You pick a starting format (draw it / worked example / analogy / questions). These aren't treated as fixed "learning styles", and Teacher adapts from what you ask. There's also an extra-small-steps mode. |
| **Voice, synced to the board** | Teacher talks with a natural ElevenLabs voice, or the best browser voice as a fallback. Drawing starts when the voice starts and is paced to finish with it. Speech recognition lets you talk back. Voice is optional: every control also works with text. |
| **Drawing speed** | 0.5× / 1× / 1.5× / 2× in the top bar. With voice on, it also sets how fast Teacher talks. |
| **Videos, only when useful** | 1–2 targeted YouTube suggestions, shown as real video cards if a YouTube key is set and as search links otherwise. |
| **Offline demo mode** | Four fully scripted lessons (Algebra, Accounting, Chemistry, Economics) that run with **no internet and no API key**. If live AI fails on a sample's first turn, the app switches to the script automatically. |
| **Private** | No accounts and no database. Recent sessions are stored only in your browser (localStorage). |

---

## Run it locally

You need **Node.js 20+** ([download](https://nodejs.org)).

```bash
npm install
cp .env.example .env.local     # then paste your key into .env.local (see below)
npm run dev                    # open http://localhost:3000
```

Without a key the app still runs. The four sample assignments work fully offline, and text PDFs and pasted problems can be uploaded and split. Tutoring on your *own* problems, and reading photos or scans, needs the key.

### Environment variables

| Name | Required | What it's for |
|---|---|---|
| `ANTHROPIC_API_KEY` | For live tutoring | Get one at [console.anthropic.com](https://console.anthropic.com/) → **API Keys** → *Create Key*. Add a few dollars of credit under **Billing**. |
| `ANTHROPIC_MODEL` | No | Defaults to `claude-sonnet-5`, which is fast and smart. `claude-opus-5-5` gives the highest quality but is slower. |
| `ANTHROPIC_EFFORT` | No | `low` / `medium` (default) / `high`. `low` gives the snappiest replies. |
| `ELEVENLABS_API_KEY` | No | A natural, human-sounding voice for Teacher. Free plan at [elevenlabs.io](https://elevenlabs.io): Profile → API Keys. Without it, Teacher uses the best voice built into the browser. `ELEVENLABS_VOICE_ID` picks a different voice. |
| `YOUTUBE_API_KEY` | No | Real video cards instead of search links. In Google Cloud Console, enable **YouTube Data API v3**, then go to Credentials → API key. |

Keys are only read on the server (in the `app/api/*` routes). They never reach the browser and are never committed. `.env*.local` is gitignored.

---

## Deploy to Vercel (≈5 minutes)

1. **Push this repo to GitHub** (already done if you're reading this there).
2. Go to [vercel.com/new](https://vercel.com/new). **Sign up with GitHub** if you don't have an account.
3. Click **Import** next to this repository. Vercel detects Next.js automatically, so leave the build settings alone.
4. Open **Environment Variables** and add `ANTHROPIC_API_KEY` = *your key*. Optionally add `YOUTUBE_API_KEY` too.
5. Click **Deploy**. After about a minute you get a URL like `https://sidecar-xyz.vercel.app`.
6. **Check it on your phone.** The pill in the top-right should say **Live AI** (green). If it says **Offline demo**, the key isn't set: go to Project → Settings → Environment Variables, add it, then Deployments → ⋯ → **Redeploy**.

Every `git push` redeploys automatically after that.

---

## The 3-minute demo script

1. **Home** (15s): "Every week I get stuck on *one* problem, and a video or ChatGPT either lectures me on the whole chapter or just gives me the answer." Drop a real PDF, or click **Algebra I**.
2. **Pick** (15s): Tap *Solve 3x + 7 = 22*, choose **Draw it out**, and turn on **Teacher talks out loud**.
3. **Diagnose** (30s): Teacher writes the equation and asks what to undo first. Pick **Divide by 3 first** (the wrong answer on purpose) to show Teacher treat it as the gap, without judging.
4. **Teach + interrupt** (60s): While it's drawing, click **Why?** or type *"why do we subtract first?"*. The drawing stops, and Teacher answers with the socks-and-shoes analogy, then goes back to the question. Then click **Show it differently**.
5. **Solo problem** (30s): Answer the steps, then solve *4x − 9 = 23* on your own. Type a wrong answer first to show the hint, then **8**.
6. **Wrap** (15s): Show the recap, **Save my recap**, and the home screen's "What you've cracked lately".
7. Optional: click **Focus**, or switch to the **Economics** sample to show graphs drawing live.

**Backup plan:** if the Wi-Fi dies, the samples still run. The pill says **Offline demo**, and the ★ lessons need no network. On a live deployment you can also force it with the "Use the offline scripted lesson" toggle on the pick screen.

---

## How it works

```
Browser (Next.js client)                              Server (Next.js API routes)
─────────────────────────                              ────────────────────────────
Upload → pdf.js text / page render / photo resize ──▶  POST /api/extract  → Claude (vision) → problems[]
Pick problem + preferences
Session loop:
  student message + history + board summary ─────────▶  POST /api/tutor    → Claude structured output
  ◀───────────── { say, phase, board[], question, choices, gap, plan, videos, practice, verdict }
  lib/board.ts  : board actions → positioned strokes/text (pure, unit-tested)
  Whiteboard.tsx: animates strokes (SVG dash + clip reveal) with the marker following the tip
  speech.ts     : TTS + speech recognition (optional)
Offline: lib/demo.ts + lib/demo-engine.ts produce the same TutorTurn shape with no network
```

Some design decisions:
- **Structured outputs, not free text.** The tutor response is a JSON schema (`lib/schema.ts`), so the board never gets half-parsed instructions. Board actions use an `anyOf` of per-action variants with all fields required, because structured outputs cap a schema at 24 optional parameters. If a model still rejects the schema, the server retries once asking for plain JSON (`createJSON` in `lib/server/claude.ts`).
- **Claude never picks pixel coordinates for normal content.** It names a zone (`left`, `right`, `full`) and the layout engine stacks content, wraps text, packs T-accounts side by side, keeps labels off the writing, and routes arrows around what's in between. This is what keeps the board readable across any subject.
- **Graphs are real math.** `plot` takes an expression (`"(x-2)^2-3"`) that is compiled by a tiny safe parser (`lib/expr.ts`, no `eval`), so curves and intersections are accurate.
- **The board is shared context.** Every request sends a compact description of what's on the board (ids + text), so Claude can say "circle the −4x in eq1".
- **Safety and cost:** keys stay server-side, there's a per-IP rate limit, and request sizes and history length are capped.

### Project layout

```
app/                 page, layout, global styles, API routes (tutor, extract, videos, status)
components/          SidecarApp (flow), Home (upload), ProblemPicker, Session, Whiteboard, Cloud, VideoCards
lib/board.ts         whiteboard layout engine
lib/expr.ts          safe math-expression compiler for plots
lib/prompt.ts        tutor + extraction system prompts
lib/schema.ts        JSON schemas for structured outputs
lib/demo*.ts         offline lessons + the engine that runs them
lib/files.ts         PDF / photo reading in the browser
lib/speech.ts        text-to-speech + speech recognition
tests/               unit tests (node:test)
scripts/             e2e browser checks + a mock Anthropic API for testing without a key
```

---

## Testing

```bash
npm test          # unit tests: layout engine, expression parser, demo engine, sanitizers
npm run lint      # TypeScript typecheck
npm run build     # production build
```

End-to-end checks with a real browser (Playwright). Run these against a running app (`npm run build && npm start`):

```bash
node scripts/e2e-demo.mjs /tmp Algebra      # full offline lesson; also Accounting | Chemistry | Economics
node scripts/e2e-upload.mjs /tmp            # text PDF, scanned PDF, photo, corrupt file, paste, focus mode, phone width
# Live path without spending credits: a local mock of the Anthropic API
node scripts/mock-anthropic.mjs 4010 &
ANTHROPIC_API_KEY=test ANTHROPIC_BASE_URL=http://localhost:4010 npm start
node scripts/e2e-live.mjs /tmp
```

---

## Likely judge questions

- **What problem does it solve?** When you're stuck on one homework problem, your options are a 20-minute video on the whole chapter, a friend who just gives you the answer, or a chatbot wall of text. Sidecar finds the *one* missing idea and teaches only that, visually, and it doesn't judge you for asking basic questions.
- **Hardest part?** Getting an LLM to draw legibly. Claude describes *what* to draw, and a layout engine decides *where*. On top of that: animating it to look hand-drawn, and making interruptions feel instant (drawing finishes immediately, speech stops, and the reply answers the exact question).
- **What's next?** Canvas integration so assignments show up without uploading, remembering which gaps you've had before so it can spot patterns across a semester, and a teacher view for common class-wide gaps.
