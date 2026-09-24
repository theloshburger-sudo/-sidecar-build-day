import type { BoardAction, Phase, Problem, TutorTurn, Verdict } from "./types";

const PHASES: Phase[] = ["diagnose", "teach", "check", "practice", "wrapup"];
const VERDICTS: Verdict[] = ["none", "correct", "partial", "incorrect"];

const s = (v: unknown, max = 600) => (typeof v === "string" ? v.slice(0, max) : "");
const arr = (v: unknown) => (Array.isArray(v) ? v : []);

/** Defensive normalization of a tutor turn, whatever the model (or a bad cache) returned. */
export function normalizeTurn(raw: unknown): TutorTurn {
  const r = (raw && typeof raw === "object" ? raw : {}) as Record<string, unknown>;
  const phase = PHASES.includes(r.phase as Phase) ? (r.phase as Phase) : "teach";
  const verdict = VERDICTS.includes(r.verdict as Verdict) ? (r.verdict as Verdict) : "none";
  const board = arr(r.board)
    .filter((b): b is BoardAction => !!b && typeof b === "object" && typeof (b as BoardAction).type === "string")
    .slice(0, 40);
  return {
    say:
      s(r.say, 900) ||
      board
        .filter((a) => a.type === "narrate" && typeof a.text === "string")
        .map((a) => String(a.text).trim())
        .join(" ")
        .slice(0, 900) ||
      // Nothing to say out loud? Ask the question rather than a canned filler line.
      s(r.question, 400) ||
      "Let's keep going.",
    phase,
    board,
    question: s(r.question, 400),
    choices: arr(r.choices).map((c) => s(c, 140)).filter(Boolean).slice(0, 4),
    gap: s(r.gap, 200),
    plan: arr(r.plan).map((p) => s(p, 60)).filter(Boolean).slice(0, 6),
    step: Number.isInteger(r.step) ? Math.max(0, Math.min(10, r.step as number)) : 0,
    videos: arr(r.videos)
      .map((v) => ({ title: s((v as { title?: unknown })?.title, 120), query: s((v as { query?: unknown })?.query, 120) }))
      .filter((v) => v.query)
      .slice(0, 2),
    practice: s(r.practice, 800),
    verdict,
    insight: s(r.insight, 120).trim(),
  };
}

/** Offline fallback: split pasted/extracted text into numbered problems. */
export function splitProblems(text: string, subject = ""): Problem[] {
  const clean = text.replace(/\r/g, "").replace(/[ \t]+\n/g, "\n").replace(/\n{3,}/g, "\n\n").trim();
  if (!clean) return [];
  const marker = /^(?:\s*)(?:(?:problem|question|exercise|q|#)\s*\d+[a-z]?[\.\):\-]?|\d{1,2}[\.\)](?=\s))/im;
  const lines = clean.split("\n");
  const chunks: string[] = [];
  let cur: string[] = [];
  for (const line of lines) {
    if (marker.test(line) && cur.join("").trim()) {
      chunks.push(cur.join("\n").trim());
      cur = [];
    }
    cur.push(line);
  }
  if (cur.join("").trim()) chunks.push(cur.join("\n").trim());

  let problems = chunks.filter((c) => c.replace(/\s/g, "").length > 8);
  // If the first chunk is a header without a problem number, drop it when others exist.
  if (problems.length > 1 && !marker.test(problems[0].split("\n")[0])) problems = problems.slice(1);
  if (!problems.length) problems = [clean];
  return problems.slice(0, 40).map((p, i) => {
    const firstLine = p.split("\n")[0].replace(/\s+/g, " ").trim();
    return {
      id: `p${i + 1}`,
      title: firstLine.length > 60 ? `${firstLine.slice(0, 57)}…` : firstLine,
      text: p.slice(0, 4000),
      subject,
    };
  });
}
