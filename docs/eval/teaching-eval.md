# Teaching evaluation (simulated)

> **How this was run:** no Anthropic API key was available in the build environment, so Claude played the tutor by
> following Sidecar's exact system prompt (`lib/prompt.ts`) turn by turn, and a simulated student replied. The tutor turns were
> then played through the real app (via `scripts/mock-anthropic.mjs`) to see the board a student actually sees.
> Response *times* can't be measured this way. Real timing logs were added to `/api/tutor` (look for `tutor_timing` in Vercel → Logs).
> Replay the "after" conversation yourself: `MOCK_TURNS=docs/eval/scenario-a-after.json node scripts/mock-anthropic.mjs 4010`.

## Rubric (0–2 each, max 10)

| | 0 | 1 | 2 |
|---|---|---|---|
| **Gets to the real problem** | 3+ turns before any help | 2 turns | Helps in turn 1–2 |
| **Clear steps** | Fragmented / side topics | Mostly clear | One idea per turn, on the actual problem |
| **Student does the thinking** | Only taps A/B/C | Some open answers | Student produces real steps |
| **No loops** | Repeats hints with no exit | Some circling | Hints end with "here's how", then student continues |
| **Ends able to do it alone** | Never reaches practice | Practice late | Solves a fresh problem |

---

## Scenario A: `I = (0, 3]`, `J = (−3, 2)`, find `I ∩ J` and `I ∪ J`
Student opener: *"I don't get how to combine them."*

### Before (current prompt)

| # | Tutor (spoken + question) | Choices | Student |
|---|---|---|---|
| 1 | "Let's put I and J on a number line. Quick check before we combine them: what does the **]** in (0, 3] mean?" | 3 included / 3 not included / not sure | "3 is included I think" |
| 2 | "Right! One more check: what does **∩** mean?" | in both / in either / not sure | "not sure, that's what I'm stuck on" |
| 3 | "∩ means the part in both. Look where the bars overlap. Where do they overlap?" | 0 to 2 / −3 to 3 / 2 to 3 | "0 to 2" |
| 4 | "Close! Now the endpoints. Should the overlap use ( or [ at 0?" | ( / [ / not sure | "[ ?" |
| 5 | "Not quite. Remember I starts with a round bracket at 0… so ( or [?" | ( / [ / not sure | "oh, (" |
| 6 | "And at 2?" | ) / ] / not sure | ")" |
| 7 | "So what is I ∩ J?" | – | "(0, 2)" |
| 8–10 | Same pattern again for ∪… | | |

**Score: 3/10.** The first real help comes in turn 3. Nine of ten turns are multiple choice. The student never writes more than two characters of math. Answering the student's actual question takes about 10 turns.

### After (new prompt)

| # | Tutor | Student |
|---|---|---|
| 1 | Draws I and J on one number line. "Where does it get confusing?" · *I don't know what ∩/∪ mean* · *I mess up the endpoints* · *Check my answer* | "I don't know what ∩ and ∪ mean" |
| 2 | "∩ means *in both*. Watch: the bars overlap from 0 to 2." *(adds an I ∩ J row)* "0 isn't in I and 2 isn't in J, so both ends stay open: **I ∩ J = (0, 2)**. Your turn: ∪ means *in either one*. What's I ∪ J?" | "(−3, 3]" |
| 3 | "Exactly. It runs from −3 all the way to 3, and 3 is included because of I's bracket." *(writes it in green)* "Try one on your own: A = [1, 5), B = (3, 8]. Find A ∩ B and A ∪ B." | "(3, 5) and [1, 8]" |
| 4 | "Both right. Key idea: ∩ is the overlap, ∪ is everything; check each endpoint against the set it comes from." | |

**Score: 10/10.** Real help comes in turn 2. The student writes both answers themselves and finishes in 4 turns.

---

## Scenario B: `5(x − 2) = 3x + 4`, student distributes wrong (`5x − 2 = 3x + 4`)

| | Before | After |
|---|---|---|
| Turns to find the mistake | 3 (two diagnostic quizzes on "what is distributing?" first) | 1 (Teacher reads the student's actual line and circles `−2`) |
| What the student produced | taps: "Multiply both", "10", "Subtract 3x" | writes `5x − 10`, then `2x = 14`, then `x = 7` |
| Loop risk | "Never give the answer" → 3 hint turns on one step | The hint ladder ends by showing `5·2 = 10`, then the student continues |
| Score | 4/10 | 9/10 |

## Scenario C: accrued salaries, student interrupts "why is it a liability?"

| | Before | After |
|---|---|---|
| Answers the interruption directly | yes | yes |
| Returns to the actual entry | after a quiz on debit/credit rules | immediately: "So on Dec 31 we record…", then the student writes the credit side |
| Score | 5/10 | 9/10 |

---

## What changed (and why)

1. **Help first, not quiz first.** Turn 1 asks *where* the student is stuck (3 quick options + free text) instead of testing trivia.
2. **I do → you do on the real problem.** Teacher works one piece with reasons, then the student does the next piece. Parallel pieces (∩ then ∪) are perfect for this.
3. **Hint ladder with an exit.** Nudge → bigger hint → show the step with the reason → student does the next step. There are no infinite loops.
4. **Open answers by default.** Choices only for "where are you stuck" style questions, never for math the student should write.
5. **1–3 beats per turn**, each tied to one thing drawn.
6. **Speed:** thinking is turned off for tutor turns (with automatic fallback), shorter client pauses, and per-turn timing logs.
