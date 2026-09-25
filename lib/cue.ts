// When, inside one spoken line, each board action should happen: a real teacher circles the "+ 7"
// as they say "plus 7", not at the start of the sentence.
import type { BoardAction } from "./types";
import { speakable } from "./speech";

const NUMBER_WORDS = ["zero", "one", "two", "three", "four", "five", "six", "seven", "eight", "nine", "ten", "eleven", "twelve", "thirteen", "fourteen", "fifteen", "sixteen", "seventeen", "eighteen", "nineteen", "twenty"];
const norm = (t: string) =>
  speakable(t)
    .toLowerCase()
    .replace(/[^a-z0-9$.%]+/g, " ")
    // "plus seven" and "+ 7" are the same thing
    .replace(/\b(zero|one|two|three|four|five|six|seven|eight|nine|ten|eleven|twelve|thirteen|fourteen|fifteen|sixteen|seventeen|eighteen|nineteen|twenty)\b/g, (w) => String(NUMBER_WORDS.indexOf(w)))
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
  // A curved arrow on a drawing is a turn ("a quarter turn", "go around").
  if (a.type === "sketch" && a.kind === "arc") ["quarter turn", "turn", "around", "rotate", "spin"].forEach(add);
  if (a.type === "sketch" && a.kind === "dot") ["where", "lands", "land"].forEach(add);
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

/** Where (character index into the normalized line) an action's subject is said, from `from` on; null if never. */
function locate(said: string, a: BoardAction, from: number, lookup: (id: string) => string | undefined, verbAlone = true): number | null {
  let at: number | null = null;
  // "…so I circle the 3x": when the line says what it's doing, the thing named after that verb is the one.
  const verb = VERBS[a.type];
  const v = verb ? verb.exec(said.slice(from)) : null;
  const start = v ? from + v.index : from;
  // With a verb, the mark goes on after it: the thing named after "circle", else the verb itself.
  for (const phrase of phrasesFor(a, lookup)) {
    const p = norm(phrase);
    if (!p) continue;
    // Whole words only: the label "i" must not match the i inside "multiplying".
    const whole = new RegExp(`(^| )${p.replace(/[.$%*+?^()[\]{}|\\]/g, "\\$&")}( |$)`, "g");
    whole.lastIndex = start;
    const hit = whole.exec(said);
    if (hit) return hit.index + hit[1].length;
    // Otherwise the most telling word of it (numbers and long words first).
    const words = p.split(" ").filter((w) => w.length > 1 && !STOP.has(w)).sort((x, y) => Number(/\d/.test(y)) - Number(/\d/.test(x)) || y.length - x.length);
    for (const w of words) {
      const re = new RegExp(`(^| )${w.replace(/[.$%]/g, "\\$&")}( |$)`, "g");
      re.lastIndex = start;
      const m = re.exec(said);
      if (m) return m.index + m[1].length;
    }
  }
  if (v && verbAlone) at = start;
  return at;
}

/** Marks point at something already on the board; they only make sense once their words are said. */
const MARKS = new Set<BoardAction["type"]>(["circle", "underline", "highlight", "strike", "pointTo", "arrow"]);
export const isMark = (a: BoardAction) => MARKS.has(a.type);

/** Does this spoken line name what the action is about? */
export function mentions(line: string, a: BoardAction, lookup: (id: string) => string | undefined = () => undefined): boolean {
  const said = norm(line);
  // Only a real mention counts here ("this"/"that" alone doesn't name anything).
  return !!said && locate(said, a, 0, lookup, a.type !== "pointTo") != null;
}

/**
 * Does the line go with this pointer at all: naming what it points at, or pointing with words
 * ("look", "this", "here")? A pointer with neither lands on something the voice never mentions,
 * which is confusing ("We want x alone." while it rings the "+ 7"), so it's skipped. Like Clicky,
 * only point when the pointing goes with what's being said.
 */
export function pointerFits(line: string, a: BoardAction, lookup: (id: string) => string | undefined = () => undefined): boolean {
  const said = norm(line);
  return !!said && locate(said, a, 0, lookup, true) != null;
}

/**
 * Claude sometimes puts a circle or pointer with the sentence BEFORE the one that explains it
 * ("We want x alone." + circle "+ 7", then "The plus 7 was added last…"). Move such marks into the
 * next line when that line names them, so they land on their words instead of on the wrong sentence.
 */
export function shiftMarks(beat: { text: string; actions: BoardAction[] }, next: { text: string; actions: BoardAction[] }, lookup: (id: string) => string | undefined = () => undefined) {
  if (!next.text) return;
  const keep: BoardAction[] = [];
  const moved: BoardAction[] = [];
  for (const a of beat.actions) {
    if (isMark(a) && !mentions(beat.text, a, lookup) && mentions(next.text, a, lookup)) moved.push(a);
    else keep.push(a);
  }
  if (!moved.length) return;
  beat.actions.splice(0, beat.actions.length, ...keep);
  next.actions.unshift(...moved);
}

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
    const at = locate(said, a, from, lookup);
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
    for (let m = i; m < j; m++) {
      // An unexplained mark goes as late as it can (right before the next thing that IS named), never at the start.
      if (isMark(actions[m])) out[m] = Math.max(lo, hi - 0.04 * (j - 1 - m));
      else out[m] = i === 0 ? lo + ((hi - lo) * (m - i)) / run : lo + ((hi - lo) * (m - i + 1)) / (run + 1);
    }
    i = j - 1;
  }
  // A label the pointer then lands on appears just as it's pointed at ("…that's i"), not at an earlier mention.
  actions.forEach((a, k) => {
    if (a.type !== "pointTo" || !a.target) return;
    const made = actions.findIndex((b, m) => m < k && b.id === a.target);
    if (made >= 0) out[made] = Math.max(out[made] as number, (out[k] as number) - 0.03);
  });
  let prev = 0;
  return out.map((f) => (prev = Math.max(prev, Math.min(1, f as number))));
}
