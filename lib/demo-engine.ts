// Runs a scripted DemoLesson like a (simple) tutor: checks answers, gives hints,
// handles "why?" / "show me differently" / "slow down" interruptions.

import type { DemoLesson, DemoTurn } from "./demo";
import type { TutorTurn, Verdict } from "./types";

export interface DemoState {
  idx: number;
  wrong: number;
}

function toTurn(d: DemoTurn, extra: Partial<TutorTurn> = {}): TutorTurn {
  return {
    say: d.say,
    phase: d.phase ?? "teach",
    board: d.board ?? [],
    question: d.question ?? "",
    choices: d.choices ?? [],
    gap: d.gap ?? "",
    plan: d.plan ?? [],
    step: d.step ?? 0,
    videos: d.videos ?? [],
    practice: d.practice ?? "",
    verdict: "none",
    ...extra,
  };
}

const normalize = (s: string) =>
  s
    .toLowerCase()
    .replace(/[−–]/g, "-")
    .replace(/[$,]/g, "")
    .replace(/\s+/g, "");

const numbersIn = (s: string) => (s.replace(/,/g, "").match(/-?\d+(?:\.\d+)?/g) ?? []).map(Number);

export function matchesAnswer(answer: string, expects: string[]): boolean {
  const a = normalize(answer);
  const nums = numbersIn(answer);
  return expects.some((e) => {
    const en = normalize(e);
    if (/^-?\d+(\.\d+)?$/.test(en)) {
      const target = Number(en);
      return nums.some((n) => Math.abs(n - target) <= Math.max(0.01, Math.abs(target) * 0.01));
    }
    return a.includes(en);
  });
}

type InterruptKind = "why" | "differently" | "slower";

export function classifyInterrupt(text: string): InterruptKind | null {
  const s = text.trim().toLowerCase();
  if (/different|another way|other way|picture|visual|draw|example|analogy/.test(s)) return "differently";
  if (/slow|too fast|confus|lost|don'?t (get|understand)|do not (get|understand)|huh|what\?*$/.test(s)) return "slower";
  if (/\?$/.test(s) || /^(why|how|what|wait|can you|could you|explain|where|when|isn'?t|shouldn'?t)/.test(s)) return "why";
  return null;
}

export function demoStart(lesson: DemoLesson): { turn: TutorTurn; state: DemoState } {
  return { turn: toTurn(lesson.script[0]), state: { idx: 0, wrong: 0 } };
}

export function demoReply(lesson: DemoLesson, state: DemoState, text: string): { turn: TutorTurn; state: DemoState } {
  const script = lesson.script;
  const cur = script[state.idx];
  const last = script.length - 1;

  if (state.idx >= last) {
    return {
      turn: toTurn({
        say: "You're all set on this one! Pick another problem from your assignment whenever you're ready, or try the practice again.",
        phase: "wrapup",
        board: [],
      }),
      state,
    };
  }

  const advance = (verdict: Verdict, prefix = "") => {
    const next = script[state.idx + 1];
    return {
      turn: toTurn(next, { say: `${prefix}${next.say}`, verdict }),
      state: { idx: state.idx + 1, wrong: 0 },
    };
  };

  // A real question ("why do we subtract?") wins over a keyword that happens to match the answer.
  const kind = classifyInterrupt(text);
  const clearlyQuestion = /^\s*(why|how|what|wait|can|could|explain|show|slow|i don'?t|i do not|huh)/i.test(text);
  if (!(kind && clearlyQuestion) && cur.expect && matchesAnswer(text, cur.expect)) return advance("correct", cur.rightPrefix);

  if (kind) {
    const it = lesson.interrupts[kind];
    const back = cur.question ? ` Now, back to our question: ${cur.question}` : "";
    return {
      turn: toTurn(it, {
        say: `${it.say}${back}`,
        phase: cur.phase ?? "teach",
        question: cur.question ?? "",
        choices: cur.choices ?? [],
        step: cur.step ?? 0,
      }),
      state,
    };
  }

  if (cur.expect) {
    if (state.wrong === 0 && cur.hint) {
      return {
        turn: toTurn({ say: cur.hint, phase: cur.phase, board: cur.hintBoard ?? [] }, {
          question: cur.question ?? "",
          choices: cur.choices ?? [],
          step: cur.step ?? 0,
          verdict: "incorrect",
        }),
        state: { ...state, wrong: 1 },
      };
    }
    return advance(cur.phase === "diagnose" ? "none" : "incorrect", cur.wrongPrefix);
  }
  return advance("none");
}
