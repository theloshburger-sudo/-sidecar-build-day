// Exponents and subscripts, rendered as real raised/lowered text instead of Unicode
// superscript glyphs (which come from mixed fonts and look broken, e.g. "i¹⁴²").

const SUP = "⁰¹²³⁴⁵⁶⁷⁸⁹⁺⁻⁼⁽⁾ⁿⁱˣʸᵃᵇᶜᵈᵉᵏᵐᵗ";
const SUP_PLAIN = "0123456789+-=()nixyabcdekmt";
const SUB = "₀₁₂₃₄₅₆₇₈₉₊₋₌₍₎ₐₑₓₙ";
const SUB_PLAIN = "0123456789+-=()aexn";

export type Seg = { t: string; k: "n" | "sup" | "sub" };

/** Map a single superscript/subscript character to its plain form (for matching). */
export function plainChar(c: string): string {
  const i = SUP.indexOf(c);
  if (i >= 0) return SUP_PLAIN[i];
  const j = SUB.indexOf(c);
  if (j >= 0) return SUB_PLAIN[j];
  return c;
}

/** Turn caret notation (x^2, i^142, x^(n+1), e^{-x}) into Unicode superscripts where possible. */
export function caretToUnicode(text: string): string {
  return text.replace(/\^(?:\{([^{}]{1,12})\}|\(([^()]{1,12})\)|([+−-]?[0-9a-zA-Z]{1,6}))/g, (m, a, b, c) => {
    const raw = (a ?? b ?? c ?? "").replace(/−/g, "-").replace(/\s+/g, "");
    const wrap = b !== undefined && /[+\-]/.test(raw.slice(1));
    const inner = wrap ? `(${raw})` : raw;
    let out = "";
    for (const ch of inner) {
      const k = SUP_PLAIN.indexOf(ch);
      if (k < 0) return m; // not representable: leave as typed
      out += SUP[k];
    }
    return out;
  });
}

/** Split text into normal / superscript / subscript runs. */
export function segments(text: string): Seg[] {
  const src = caretToUnicode(text);
  const out: Seg[] = [];
  for (const ch of src) {
    const k: Seg["k"] = SUP.includes(ch) ? "sup" : SUB.includes(ch) ? "sub" : "n";
    const t = k === "n" ? ch : plainChar(ch);
    const last = out[out.length - 1];
    if (last && last.k === k) last.t += t;
    else out.push({ t, k });
  }
  return out;
}
