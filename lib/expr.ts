// A tiny, safe math-expression compiler for plotting. No eval, no Function().
// Supports + - * / ^, parentheses, implicit multiplication (2x, 3(x+1), x(x-1)),
// unary minus, constants pi / e, and common functions.

type Node =
  | { k: "num"; v: number }
  | { k: "x" }
  | { k: "neg"; a: Node }
  | { k: "bin"; op: string; a: Node; b: Node }
  | { k: "fn"; name: string; a: Node };

const FUNCS: Record<string, (v: number) => number> = {
  sin: Math.sin,
  cos: Math.cos,
  tan: Math.tan,
  sqrt: Math.sqrt,
  abs: Math.abs,
  ln: Math.log,
  log: Math.log10,
  exp: Math.exp,
  floor: Math.floor,
  ceil: Math.ceil,
};

type Tok = { t: "num"; v: number } | { t: "id"; v: string } | { t: "op"; v: string };

function tokenize(src: string): Tok[] {
  const s = src
    .replace(/\s+/g, "")
    .replace(/[−–]/g, "-")
    .replace(/[×·]/g, "*")
    .replace(/÷/g, "/")
    .replace(/²/g, "^2")
    .replace(/³/g, "^3")
    .replace(/π/g, "pi")
    .replace(/\*\*/g, "^")
    .toLowerCase();
  const out: Tok[] = [];
  let i = 0;
  while (i < s.length) {
    const c = s[i];
    if (/[0-9.]/.test(c)) {
      let j = i;
      while (j < s.length && /[0-9.]/.test(s[j])) j++;
      const v = Number(s.slice(i, j));
      if (!Number.isFinite(v)) throw new Error("bad number");
      out.push({ t: "num", v });
      i = j;
    } else if (/[a-z]/.test(c)) {
      let j = i;
      while (j < s.length && /[a-z]/.test(s[j])) j++;
      const word = s.slice(i, j);
      // Split things like "xsin" or "pix" into known pieces.
      let k = 0;
      while (k < word.length) {
        const rest = word.slice(k);
        const known = [...Object.keys(FUNCS), "pi", "x", "e"]
          .sort((a, b) => b.length - a.length)
          .find((name) => rest.startsWith(name));
        if (!known) throw new Error(`unknown name "${rest}"`);
        out.push({ t: "id", v: known });
        k += known.length;
      }
      i = j;
    } else if ("+-*/^()".includes(c)) {
      out.push({ t: "op", v: c });
      i++;
    } else {
      throw new Error(`unexpected "${c}"`);
    }
  }
  return out;
}

function parse(tokens: Tok[]): Node {
  let p = 0;
  const peek = () => tokens[p];
  const isOp = (v: string) => peek()?.t === "op" && peek()!.v === v;

  function expr(): Node {
    let n = term();
    while (isOp("+") || isOp("-")) {
      const op = (tokens[p++] as { v: string }).v;
      n = { k: "bin", op, a: n, b: term() };
    }
    return n;
  }
  function startsFactor(): boolean {
    const t = peek();
    if (!t) return false;
    return t.t === "num" || t.t === "id" || (t.t === "op" && t.v === "(");
  }
  function term(): Node {
    let n = unary();
    for (;;) {
      if (isOp("*") || isOp("/")) {
        const op = (tokens[p++] as { v: string }).v;
        n = { k: "bin", op, a: n, b: unary() };
      } else if (startsFactor()) {
        n = { k: "bin", op: "*", a: n, b: power() }; // implicit multiplication
      } else return n;
    }
  }
  function unary(): Node {
    if (isOp("-")) {
      p++;
      return { k: "neg", a: unary() };
    }
    if (isOp("+")) {
      p++;
      return unary();
    }
    return power();
  }
  function power(): Node {
    const base = atom();
    if (isOp("^")) {
      p++;
      return { k: "bin", op: "^", a: base, b: unary() }; // right-assoc
    }
    return base;
  }
  function atom(): Node {
    const t = tokens[p++];
    if (!t) throw new Error("unexpected end");
    if (t.t === "num") return { k: "num", v: t.v };
    if (t.t === "op" && t.v === "(") {
      const n = expr();
      if (!isOp(")")) throw new Error("missing )");
      p++;
      return n;
    }
    if (t.t === "id") {
      if (t.v === "x") return { k: "x" };
      if (t.v === "pi") return { k: "num", v: Math.PI };
      if (t.v === "e") return { k: "num", v: Math.E };
      if (FUNCS[t.v]) {
        const arg = isOp("(") ? atom() : power();
        return { k: "fn", name: t.v, a: arg };
      }
    }
    throw new Error("unexpected token");
  }

  const n = expr();
  if (p !== tokens.length) throw new Error("trailing input");
  return n;
}

function evaluate(n: Node, x: number): number {
  switch (n.k) {
    case "num":
      return n.v;
    case "x":
      return x;
    case "neg":
      return -evaluate(n.a, x);
    case "fn":
      return FUNCS[n.name](evaluate(n.a, x));
    case "bin": {
      const a = evaluate(n.a, x);
      const b = evaluate(n.b, x);
      switch (n.op) {
        case "+":
          return a + b;
        case "-":
          return a - b;
        case "*":
          return a * b;
        case "/":
          return a / b;
        default:
          return Math.pow(a, b);
      }
    }
  }
}

/** Compile "y = 2x + 1" / "f(x)=x^2" / "x^2 - 3" into a function. Returns null if invalid. */
export function compileExpression(src: string): ((x: number) => number) | null {
  try {
    const cleaned = src.replace(/^\s*(y|f\s*\(\s*x\s*\))\s*=\s*/i, "");
    const tree = parse(tokenize(cleaned));
    return (x: number) => evaluate(tree, x);
  } catch {
    return null;
  }
}
