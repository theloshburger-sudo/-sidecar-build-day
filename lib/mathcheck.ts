// A backstop for the whiteboard: plain arithmetic like "8,000 + 8,700 = 23,500" is recomputed,
// and a wrong result is replaced before it's drawn. A tutor must never write wrong math.
// Only pure-number chains are touched; algebra ("3x + 7 = 22"), blanks ("= ?") and words are left alone.

import { compileExpression } from "./expr";
import type { BoardAction } from "./types";

const NUM = /^\s*(\$?)\s*([−-]?)\s*(\d{1,3}(?:,\d{3})+|\d+)(\.\d+)?\s*$/;
const EXPR_CHARS = /^[\d\s,.$+\-−×*÷/()^²³]+$/;
const OPERATOR = /[+\-−×*÷/^²³]/;

function evaluate(expr: string): number | null {
  if (!EXPR_CHARS.test(expr) || !OPERATOR.test(expr.replace(/^\s*[−-]/, ""))) return null;
  const src = expr
    .replace(/\$/g, "")
    .replace(/(\d),(?=\d{3}\b)/g, "$1")
    .replace(/−/g, "-")
    .replace(/×/g, "*")
    .replace(/÷/g, "/")
    .replace(/²/g, "^2")
    .replace(/³/g, "^3");
  const f = compileExpression(src);
  if (!f) return null;
  const v = f(0);
  return Number.isFinite(v) ? v : null;
}

function format(v: number, like: RegExpExecArray, unicodeMinus: boolean): string {
  const grouping = like[3].includes(",") || Math.abs(v) >= 10000;
  const s = Math.abs(v).toLocaleString("en-US", { useGrouping: grouping, maximumFractionDigits: 4 });
  const sign = v < 0 ? (unicodeMinus ? "−" : "-") : "";
  return `${like[1]}${sign}${s}`;
}

/** Returns the text with any wrong arithmetic result corrected (or the same string). */
export function fixArithmetic(text: string): string {
  if (!text.includes("=")) return text;
  const parts = text.split("=");
  let changed = false;
  for (let i = 1; i < parts.length; i++) {
    const rhs = NUM.exec(parts[i]);
    if (!rhs) continue;
    const value = evaluate(parts[i - 1].replace(/^.*:\s*/, ""));
    if (value === null) continue;
    const shown = Number(`${rhs[2] ? "-" : ""}${rhs[3].replace(/,/g, "")}${rhs[4] ?? ""}`);
    const decimals = rhs[4] ? rhs[4].length - 1 : 0;
    const rounded = Math.round(value * 10 ** decimals) / 10 ** decimals;
    if (Math.abs(rounded - shown) < 1e-9) continue;
    const lead = parts[i].match(/^\s*/)![0];
    const trail = parts[i].match(/\s*$/)![0];
    parts[i] = `${lead}${format(value, rhs, text.includes("−"))}${trail}`;
    changed = true;
  }
  return changed ? parts.join("=") : text;
}

/** Same action, with its text and list items checked. Returns the original object when nothing changed. */
export function checkAction(a: BoardAction): BoardAction {
  const text = typeof a.text === "string" ? fixArithmetic(a.text) : a.text;
  const items = Array.isArray(a.items) ? a.items.map((t) => (typeof t === "string" ? fixArithmetic(t) : t)) : a.items;
  const itemsChanged = Array.isArray(a.items) && items!.some((t, i) => t !== a.items![i]);
  if (text === a.text && !itemsChanged) return a;
  if (typeof console !== "undefined") console.warn("corrected arithmetic on the board", { from: a.text ?? a.items, to: text ?? items });
  return { ...a, text, items };
}
