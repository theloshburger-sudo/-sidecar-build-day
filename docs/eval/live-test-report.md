# Sidecar live-path test report — 24 Sep 2026 (night before the demo)

## Summary

**I could not run real Claude here. Read this first.** This cloud environment has `ELEVENLABS_API_KEY` but **no `ANTHROPIC_API_KEY`**
(`env | grep -c API_KEY` → 1). The environment's network policy also **blocks `api.elevenlabs.io`** (the proxy returns 403 "Host not in allowlist").
`api.anthropic.com` is reachable, so adding the key is the only missing piece for Claude.

So I tested everything except the model itself:

- All 6 sessions (31 turns) went through the **real UI, the real `/api/tutor` streaming route, the stream parser, the beat player, the layout engine and the pointer**.
  The replies came from scripted turns (`docs/eval/sim/*.json`) that I wrote by following `TUTOR_SYSTEM` beat by beat, and `scripts/mock-anthropic.mjs` streamed them.
- That validates streaming, talk-while-draw timing, where the pointer lands and how its label is placed, the layout, and error handling.
  **It does not validate real Claude's behaviour:** how often it uses `pointTo`, teaching quality, factual correctness, schema acceptance or latency.
  All timings below are mock timings (about 0.3 s to first byte), not Claude's.
- **Before the demo, run the live eval (about 10 min, 31 Claude calls). See "Run it for real" at the bottom.** It writes the same tables from real transcripts.

### What works
- Every turn in all 6 sessions played to the end with **0 page errors, 0 failed requests and 0 error banners**.
- **Talk-while-draw:** every beat's strokes appeared while its own line was on screen. **0 strokes were drawn after the last line** in all 31 turns, so nothing is dumped at the end.
  First beat appears about 0.35 s after the first streamed bytes.
- **Pointer:** it flies on a curved path, rings the target and types its label. It landed on the right thing in every case tested:
  a substring ("+ 7", "22", "140"), a timeline date, a T-account amount, a canvas shape, a flow box, and a spot on a graph given as coordinates (the supply/demand crossing).
  After the fixes below, no label covers any writing, which was measured on screen at the moment the label was showing.
- **"Draw a clock"** gives a real clock (canvas + circle + labels + arc arrow), not a graph.
- Exponents render as raised text on the board, in captions and now in pointer labels. No raw `^`, `{}` or `$$` appeared in any turn.
- If a voice fails, the lesson keeps its rhythm. `/api/tts` failing (as it does here) falls back to the browser voice, and that falls back to silent timing.

### What was broken, and is now fixed (all pushed to `claude/charming-galileo-k4hhb0`)
| # | Bug (how it would show in the demo) | Fix | Proof |
|---|---|---|---|
| 1 | **Teacher would refuse questions mid-demo.** Each spoken line calls `/api/tts`, and those calls used the same per-IP counter as `/api/tutor` (limit 40 per 10 min). About two sessions of beats were enough to get "Slow down a little" back. | Each route has its own counter (tts 150, tutor 40, extract 20) | 45 TTS calls, then `/api/tutor` still accepted (the old code would have returned 429) |
| 2 | **Every beat drawn twice** when the natural voice fails and the browser voice errors right away (muted tab, no voices, autoplay blocked, headless). Writing was re-traced, the pointer flew twice and turns took twice as long. | The speech fallback fires at most once and never after the line ended; `playBeat` can't enqueue twice | New test in `tests/speech.test.ts` (fails on the old code). Algebra turn 3 went from 30.7 s to 17.2 s |
| 3 | **Pointer label on the neighbouring words.** Pointing at "+ 7" parked the cursor on the "=", and in econ "still here" covered "+ 0.5Q". | The rest of the target's line counts as writing to avoid | `before/after-econ-…`, `before/after-algebra-…` in `docs/eval/live-test/` + a test |
| 4 | **Cursor and label in the middle of big boxes**, on top of their words ("the trigger" over "Belgium"). | Big targets get the tip on their edge; the ring already shows the whole box | `before/after-history-…` + a test |
| 5 | **Label on text that isn't a board element**: timeline details ("paid $12,000"), flow titles. | The board records every piece of handwriting and the pointer avoids all of it | `before/after-accounting-…` + a test that replays every scripted session and demo lesson action by action |
| 6 | **Pointer jumps to a look-alike.** `pointTo {target "g1", match "E"}` searched the whole board and landed on the "e" in "Demand". | A named target is trusted: match inside it, then inside its pieces (flow boxes, timeline dates, T-account lines), else ring the whole target. A text search across the board only runs for an unknown id and a match of 2+ characters | Test |
| 7 | Long labels cut mid-word | Cut at a word, with "…" | Test |
| 8 | **Claude couldn't see what's pointable on later turns.** The board summary said only `g1: graph x:0..12 y:0..12`, and history drops plot formulas and point coordinates. | The summary now lists curves and points with coordinates, and the pieces of boxes, timelines and T-accounts by id. The prompt tells Claude to use those ids and graph coordinates | — |
| 9 | **The prompt's clock example gave a confusing clock**: i at 12 and 1 at 9 o'clock, labels sitting on the circle's line. Claude copies it almost verbatim (see the saved `scenario-i-clock.json`). | Example now starts at 1 = i⁰ at the top, each ×i a quarter turn, i⁴ lands back where it started, labels clear of lines | `before-clock-labels.jpg` vs `after-clock.jpg` |
| 10 | Pointer labels showed Unicode superscripts in the UI font (the "i¹⁴²" look) | Bubble uses the same raised-exponent renderer as the board | `after-clock.jpg` |
| 11 | A cut-off reply (max_tokens, dropped connection) showed a raw `SyntaxError: Unexpected end of JSON input` | Keeps the beats already played; friendly message only if nothing arrived | `truncated-reply-salvaged.jpg` (new `MOCK_TRUNCATE=1` mock mode) |
| 12 | The prompt said "1–3 beats" in one place and "1–4" in another | Now 1–4 in both | — |

Tests: 39 → **44**, all passing. `tsc` and `next build` are clean.

### What still isn't great
- **Nothing here says how real Claude behaves.** That's the biggest open risk. Run the live eval first thing tomorrow.
- **Voice is untested end to end.** ElevenLabs is blocked here, so I only confirmed the route's error path and the client fallback.
  Test all 6 voices on the demo machine (command below).
- **Pasted problems have no offline fallback.** If Claude fails on the first turn, a pasted problem shows an error with Retry.
  Only ★ sample lessons switch to the offline script on their own. If the API misbehaves live, switch to a ★ lesson.
- **The rate limit is in memory, per server instance.** 40 tutor turns per 10 min per IP.
  **Don't run the full 31-turn eval against the demo deployment in the 10 minutes before presenting**, or the demo could hit 429.
- **Pointing at the first equation after `balance` is crowded.** "3x" is on the left, "= 22" on the right, "− 7" below and the board edge above,
  so the cursor tip slightly touches the "− 7" (`after-algebra-…jpg`). The label is clean. Minor.
- **Timeline dates are evenly spaced, not to scale**: Oct 1 → Dec 31 → Sep 30 look equidistant.
  **A T-account added in a later turn stacks below the first one** instead of sitting beside it. Both are cosmetic.
- **The pointer stays on the board after a turn ends** until the next stroke. It's intentional, and it never covers writing.
- **A long canvas scrolls.** The canvas title or bottom label can be out of view at 1360×880 in focus mode; the board follows the pen.

### Recommended demo script
1. **Algebra, the main story: paste `Solve for x: 3x + 7 = 22`.**
   Tap **"I don't know how to start"** → type **`29`** (wrong) → type **`why do we subtract 7?`** (or tap the **Why?** chip) → **`15`** → **`x = 5`**.
   It shows diagnose → "I do, you do" → a hint on the wrong answer (the pointer lands on the 22) → the *why* (balance rule note, pointer "cancels out") → a check → a practice problem.
   It's short and the pointer shows up in almost every turn.
2. **Economics, for the visual: paste the supply/demand problem.** Tap **"How do I find equilibrium?"**.
   The graph draws itself, then the pointer flies to the crossing ("they meet"). Then **`Q = 10?`** (wrong) → **`Q = 8`**, and the point E (8, 6) appears.
3. **The "draw me a picture" moment: `draw a clock to explain why i^4 = 1`.** The first turn draws a clock and ends with the pointer on 1 saying "i⁴ = 1".

Rehearse each once tonight or tomorrow morning with the real key: real Claude won't say exactly these lines.
Have the ★ sample lessons ready as the fallback.

---

## Method
`scripts/e2e-live-eval.mjs` (new) drives Chromium at 1360×880 through "Paste a problem" → "Use these problems" → "Start with Teacher", then answers like a student.
It taps a choice when one matches, otherwise it types.

Every 200 ms it records:
- which caption line is current (`data-beat`)
- the stroke count
- the pointer's state, label, ring and bubble boxes
- all board text boxes
- any alert

For each turn it saves:
- screenshots at the start of every beat, about 1.1 s into every beat, when the pointer lands, and at the end
- the raw streamed `/api/tutor` body, teed inside the page because CDP can't read streamed bodies

Headless Chromium has no audio: `/api/tts` returns 502 (blocked host) and the browser voice errors immediately, so beats run on estimated speech timing (2.6 words/s at 1×).
That still exercises the sync logic: strokes are paced to the line's duration.

Columns: **beats** = per beat, `d` drawing actions + `p` pointTo actions (from the raw JSON). **Pointer** = labels as they appeared on screen, `beat:label`.
**Draw during line?** = strokes credited to the beat whose line was showing, and 0 after the last line. **Covers** = the pointer label over any on-screen text at that moment.

## Session 1 — Algebra: "Solve for x: 3x + 7 = 22"
| Turn | Student | First beat / total | Beats | Pointer | Draw during line? | Covers / layout |
|---|---|---|---|---|---|---|
| 0 | (start) | 0.63 s / 12.1 s | 1d · 0d+2p · 0d | 2: "times 3", "then + 7" | yes | none |
| 1 | "I don't know how to start" (choice) | 0.69 / 13.4 | 1d · 1d · 0d+1p | 3: "your turn" | yes | none |
| 2 | "29" (wrong) | 0.71 / 5.7 | 0d+1p · 1d | 1: "22 − 7" | yes | none |
| 3 | "why do we subtract 7?" | 0.69 / 17.2 | 1d · 0d+1p · 0d+1p | 2: "cancels out", 3: "your turn" | yes | cursor tip touches "− 7" (see above) |
| 4 | "15" | 0.72 / 8.3 | 1d · 0d+1p | 2: "× 3 left" | yes | none |
| 5 | "x = 5" | 0.70 / 11.1 | 2d · 1d · 2d | — | yes | none |

## Session 2 — Accounting: prepaid insurance adjusting entry
| Turn | Student | First beat / total | Beats | Pointer | Draw during line? | Covers / layout |
|---|---|---|---|---|---|---|
| 0 | (start) | 0.62 / 17.3 | 1d · 1d · 0d | — | yes | none |
| 1 | "Which accounts do I use?" (choice) | 0.69 / 18.0 | 1d · 1d · 0d+1p | 3: "count months" (timeline Dec 31) | yes | none |
| 2 | "2 months, so 2,000" (wrong) | 0.69 / 9.7 | 0d+2p · 0d+1p | 1: "start", "3 months later"; 2: "per month" | yes | none (was: "start" over "paid $12,000", fixed) |
| 3 | "3,000" | 0.68 / 16.2 | 1d · 0d+1p · 1d | 2: "was 12,000" (T-account line) | yes | none |
| 4 | "can you show it differently?" | 0.90 / 12.1 | 3d · 2d+1p | 2: "still an asset" (canvas shape) | yes | none; switched to a bar picture as asked |
| 5 | "9,000" | 0.69 / 8.3 | 1d · 2d | — | yes | none |

## Session 3a — Economics: equilibrium on a graph
| Turn | Student | First beat / total | Beats | Pointer | Draw during line? | Covers / layout |
|---|---|---|---|---|---|---|
| 0 | (start) | 0.63 / 14.8 | 2d · 3d · 0d | — | yes (graph and both curves drawn during beat 2) | none |
| 1 | "How do I find equilibrium?" (choice) | 0.67 / 14.1 | 1d+1p · 1d · 0d | 1: "they meet" at graph (8, 6) | yes | none |
| 2 | "Q = 10?" (wrong) | 0.71 / 5.8 | 0d+1p · 1d | 1: "still here" on the "2" | yes | none (was: over "+ 0.5Q", fixed) |
| 3 | "Q = 8" | 0.68 / 13.0 | 1d · 1d · 0d+1p | 3: "gives 6 too" | yes | none |
| 4 | "surplus" | 0.69 / 7.4 | 1d · 2d | — | yes | none |

## Session 3b — Economics: pollution externality vs social optimum
| Turn | Student | First beat / total | Beats | Pointer | Draw during line? | Covers / layout |
|---|---|---|---|---|---|---|
| 0 | (start) | 0.63 / 16.0 | 1d · 3d · 0d | — | yes | none |
| 1 | "How do I draw it?" (choice) | 0.69 / 18.5 | 2d · 1d · 0d+1p | 3: "cross here?" at (6, 7) | yes | none |
| 2 | "Q = 10?" (wrong) | 0.70 / 10.8 | 0d+1p · 1d | 1: "market is 8" at (8, 6) | yes | none |
| 3 | "Q = 6" | 0.67 / 9.9 | 1d · 1d+1p | 2: "too much" | yes | none |
| 4 | "because the factory doesn't pay for the pollution" | 0.68 / 12.6 | 1d · 2d | — | yes | none |

## Session 4 — History: alliances → world war
| Turn | Student | First beat / total | Beats | Pointer | Draw during line? | Covers / layout |
|---|---|---|---|---|---|---|
| 0 | (start) | 0.62 / 7.6 | 1d · 0d | — | yes | none |
| 1 | "What's the alliance system?" (choice) | 0.88 / 16.6 | 2d · 2d · 0d+1p | 3: "Serbia's ally" (box item Russia) | yes | none |
| 2 | "Russia, they got their army ready" | 0.68 / 14.9 | 1d · 1d+1p | 2: "backs Austria" | yes | none |
| 3 | "why did Germany go through Belgium though?" | 0.66 / 14.7 | 1d · 1d+1p | 2: "the trigger" (flow box) | yes | none (was: over "Belgium", fixed) |
| 4 | "the alliances meant every country…" | 0.69 / 11.6 | 0d+2p · 2d | 1: "one domino", "…knocks all" | yes | none (was: over flow title, fixed) |

## Session 5 — "draw a clock to explain why i^4 = 1"
| Turn | Student | First beat / total | Beats | Pointer | Draw during line? | Covers / layout |
|---|---|---|---|---|---|---|
| 0 | (start) | 0.66 / 24.5 | 2d · 2d · 2d · 1d+1p | 4: "i⁴ = 1" | yes (face, then labels in pairs, then arc) | none; a real clock, not a graph |
| 1 | "at i, 3 o'clock" | 0.68 / 11.1 | 0d+1p · 1d · 1d | 1: "i⁵ = i" | yes | none |
| 2 | "i?" (wrong) | 0.67 / 10.5 | 0d+2p · 0d+1p | 1: "35 laps", "2 more"; 2: "i¹⁴² = −1" | yes | none; exponents raised properly |
| 3 | "−i" | 0.70 / 7.2 | 0d+1p · 2d | 1: "i¹⁴³ = −i" | yes | none |

Raw metrics: `docs/eval/live-test/sim-run-summary.json`. Scripted turns: `docs/eval/sim/*.json`, regenerate them with `node scripts/eval-sim-turns.mjs`.

## Teaching quality
I wrote the scripted turns, so scoring them would be grading my own homework; they follow the prompt by construction.
What I can say from reviewing `TUTOR_SYSTEM` against the rubric:
- **Diagnoses first:** yes (a diagnose phase, one turn, 2–3 choices).
- **Doesn't dump the answer:** yes ("I do, you do"; the final answer is shown only after two tries).
- **Hint ladder when wrong:** yes (nudge → bigger hint → show the step).
- **Explains why:** yes ("every narrate line says what and why"; interruptions come first).
- **Checks understanding:** partial. It grades answers with `verdict`, but nothing asks for an explain-back. The history turn above does it because the prompt's essay guidance nudges it.
- **Practice at the end:** yes (the `practice` phase).
- **Correct math and facts:** can't be checked from the prompt. That's the main thing to read in the live transcripts.
  For the history problem, check the dates (28 Jun; 28 Jul; 1–4 Aug; the 1839 Treaty of London).

When grading the live run, check each turn's raw JSON for:
- (a) did it ask where the student is stuck before teaching
- (b) on "29" / "Q = 10?" / "2 months", did it point at the specific mistake and give a hint rather than the answer
- (c) on "why…?", did it answer the why before moving on
- (d) on "show it differently", did it change the picture
- (e) is there a practice problem at the end
- (f) is every number right

## Voice (ElevenLabs)
Not verifiable here: every voice id (george, sarah, brian, jessica, charlie, alice) got a 502 from `/api/tts`, because the proxy refuses `api.elevenlabs.io`.
The route and fallback behaved correctly: the client got the 502 quickly and went to the browser voice, then to silent timing, and the lesson never stalled.

## Run it for real (tomorrow morning, ~10 minutes)
The environment needs `ANTHROPIC_API_KEY` set and `api.elevenlabs.io` allowed in its network settings.
```sh
npm ci && npm test && npm run build
npx next start -p 3000 &            # reads ANTHROPIC_API_KEY / ELEVENLABS_API_KEY from env
node scripts/e2e-live-eval.mjs docs/eval/live-run                  # all 6 sessions (31 Claude calls)
node scripts/e2e-live-eval.mjs docs/eval/live-run algebra econ     # or just the demo ones
for v in george sarah brian jessica charlie alice; do
  curl -s -o /dev/null -w "$v %{http_code} %{content_type}\n" -X POST localhost:3000/api/tts \
    -H 'content-type: application/json' -d "{\"text\":\"Hello there\",\"voice\":\"$v\"}"; done   # expect 200 audio/mpeg
```
Each session folder gets `raw.json` (every streamed reply), `metrics.json` (the per-turn numbers above) and screenshots. `summary.json` covers the whole run.
The student answers are fixed, so if real Claude asks something different the answer may not fit. That's still a useful test; just read the turn.
Without a key, the same harness replays the scripted turns:
`ANTHROPIC_API_KEY=test ANTHROPIC_BASE_URL=http://localhost:4010 npx next start -p 3000`, then `MOCK_PORT=4010 node scripts/e2e-live-eval.mjs out/`.
