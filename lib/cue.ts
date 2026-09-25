// When, inside one spoken line, each board action should happen: a real teacher circles the "+ 7"
// as they say "plus 7", not at the start of the sentence.
import type { BoardAction } from "./types";
import { speakable } from "./speech";

const norm = (t: string) =>
  speakable(t)
    .toLowerCase()
    .replace(/[^a-z0-9$.%]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();

/** Words and phrases from an action that the narration is likely to say out loud. */
function phrasesFor(a: BoardAction, lookup: (id: string) => string | undefined): string[] {
  const out: string[] = [];
  const add = (v: unknown) => {
    const s = typeof v === "string" ? v.trim() : "";
    if (s) out.push(s);
  };
  const sym = (ref: unknown) => (typeof ref === "string" && ref.includes(":") ? ref.slice(ref.indexOf(":") + 1) : "");
  switch (a.type) {
    case "circle":
    case "underline":
    case "highlight":
    case "strike":
    case "pointTo":
      add(a.match);
      add(a.text);
      if (!a.match && a.target) add(lookup(a.target));
      break;
    case "arrow":
      add(a.text);
      add(sym(a.from));
      add(sym(a.to));
      break;
    default:
      add(a.text);
      if (Array.isArray(a.items)) a.items.slice(0, 2).forEach(add);
  }
  // What teachers call the thing while drawing it ("let me draw a number line").
  const noun: Partial<Record<BoardAction["type"], string[]>> = {
    graph: ["graph"],
    numberLine: ["number line"],
    table: ["table"],
    timeline: ["timeline"],
    tAccount: ["t account", "account"],
    plot: ["curve", "line"],
    note: ["note"],
    box: ["box"],
  };
  (noun[a.type] ?? []).forEach(add);
  return out;
}

const VERBS: Partial<Record<BoardAction["type"], RegExp>> = {
  circle: /\bcircl/,
  underline: /\bunderlin/,
  highlight: /\bhighlight/,
  strike: /\b(cross|strike)/,
  pointTo: /\b(look|see|notice|this|here|that)\b/,
  arrow: /\barrow/,
  balance: /\bboth sides/,
};

const STOP = new Set(["the", "a", "an", "and", "of", "to", "is", "it", "in", "on", "this", "that", "so", "we", "for", "by", "at", "or"]);

/**
 * For each action, the fraction (0..1) of the way through `line` where its subject is spoken.
 * Found mentions are used in order (never earlier than the previous action); actions that aren't
 * mentioned are spread between their neighbours instead of all firing at the start.
 */
export function cueFractions(line: string, actions: BoardAction[], lookup: (id: string) => string | undefined = () => undefined): number[] {
  const said = norm(line);
  const n = actions.length;
  if (!n) return [];
  if (!said) return actions.map((_, i) => i / n);
  const found: (number | null)[] = [];
  let from = 0;
  for (const a of actions) {
    let at: number | null = null;
    // "…so I circle the 3x": when the line says what it's doing, the thing named after that verb is the one.
    const verb = VERBS[a.type];
    const v = verb ? verb.exec(said.slice(from)) : null;
    const start = v ? from + v.index : from;
    // With a verb, the mark goes on after it: the thing named after "circle", else the verb itself.
    for (const ph of phrasesFor(a, lookup).map((x) => [x, start] as const)) {
      const [phrase, searchFrom] = ph;
      const p = norm(phrase);
      if (!p) continue;
      const whole = said.indexOf(p, searchFrom);
      if (whole >= 0) {
        at = whole;
        break;
      }
      // Otherwise the most telling word of it (numbers and long words first).
      const words = p.split(" ").filter((w) => w.length > 1 && !STOP.has(w)).sort((x, y) => Number(/\d/.test(y)) - Number(/\d/.test(x)) || y.length - x.length);
      for (const w of words) {
        const re = new RegExp(`(^| )${w.replace(/[.$%]/g, "\\$&")}( |$)`, "g");
        re.lastIndex = searchFrom;
        const m = re.exec(said);
        if (m) {
          at = m.index + m[1].length;
          break;
        }
      }
      if (at != null) break;
    }
    if (at == null && v) at = start;
    found.push(at == null ? null : at / said.length);
    if (at != null) from = at;
  }
  // Fill the gaps: spread unmentioned actions evenly between their known neighbours
  // (the line's start, and 85% of the way through when nothing later is mentioned).
  const out = found.slice();
  for (let i = 0; i < n; i++) {
    if (out[i] != null) continue;
    let j = i;
    while (j < n && found[j] == null) j++;
    const run = j - i;
    const lo = i > 0 ? (out[i - 1] as number) : 0;
    const hi = j < n ? (found[j] as number) : Math.max(lo, 0.85);
    for (let m = i; m < j; m++) out[m] = i === 0 ? lo + ((hi - lo) * (m - i)) / run : lo + ((hi - lo) * (m - i + 1)) / (run + 1);
    i = j - 1;
  }
  let prev = 0;
  return out.map((f) => (prev = Math.max(prev, Math.min(1, f as number))));
}
