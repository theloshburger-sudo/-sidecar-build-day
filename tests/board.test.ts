import { test } from "node:test";
import assert from "node:assert/strict";
import { applyActions, emptyBoard, describeBoard } from "../lib/board";
import { DEMO_ASSIGNMENTS } from "../lib/demo";

test("write flows downward and registers ids", () => {
  const { state, prims } = applyActions(emptyBoard(), [
    { type: "write", id: "eq1", text: "3x + 7 = 22", size: "lg" },
    { type: "write", id: "eq2", text: "3x = 15" },
  ]);
  assert.equal(prims.filter((p) => p.kind === "text").length, 2);
  const a = prims[0] as { y: number };
  const b = prims[1] as { y: number };
  assert.ok(b.y > a.y);
  assert.ok(state.els.eq1 && state.els.eq2);
  assert.match(describeBoard(state), /eq1: "3x \+ 7 = 22"/);
});

test("circle with match targets substring; missing target is ignored", () => {
  const s1 = applyActions(emptyBoard(), [{ type: "write", id: "eq1", text: "3x + 7 = 22" }]).state;
  const r = applyActions(s1, [
    { type: "circle", target: "eq1", match: "+ 7" },
    { type: "circle", target: "nope", match: "zzz" },
  ]);
  assert.equal(r.prims.length, 1);
  assert.equal(r.prims[0].kind, "path");
});

test("balance writes an op under both sides", () => {
  const s1 = applyActions(emptyBoard(), [{ type: "write", id: "eq1", text: "3x + 7 = 22" }]).state;
  const r = applyActions(s1, [{ type: "balance", target: "eq1", text: "− 7" }]);
  assert.equal(r.prims.filter((p) => p.kind === "text").length, 2);
});

test("graph + plot + point produce paths; bad fn is skipped", () => {
  const r = applyActions(emptyBoard(), [
    { type: "graph", id: "g", xMin: -5, xMax: 5, yMin: -5, yMax: 5 },
    { type: "plot", target: "g", fn: "x^2 - 3" },
    { type: "plot", target: "g", fn: "import os" },
    { type: "point", target: "g", x: 0, y: -3 },
  ]);
  assert.ok(r.state.els.g);
  const paths = r.prims.filter((p) => p.kind === "path");
  assert.ok(paths.length >= 5);
});

test("clear resets the board", () => {
  const s1 = applyActions(emptyBoard(), [{ type: "write", id: "a", text: "hello" }]).state;
  const r = applyActions(s1, [{ type: "clear" }, { type: "write", text: "fresh" }]);
  assert.equal(r.prims[0].kind, "clear");
  assert.ok(!r.state.els.a);
});

test("garbage actions never throw", () => {
  const junk = [
    { type: "write" },
    { type: "table", rows: "nope" },
    { type: "tAccount" },
    { type: "timeline", items: [] },
    { type: "arrow", from: "x", to: "y" },
    { type: "drawLine", x1: NaN },
    { type: "graphArrow" },
    { type: "bogus" },
  ] as never[];
  assert.doesNotThrow(() => applyActions(emptyBoard(), junk));
});

test("every demo script turn lays out without errors", () => {
  for (const demo of DEMO_ASSIGNMENTS) {
    let state = emptyBoard();
    const all = [...demo.lesson.script, ...Object.values(demo.lesson.interrupts)];
    for (const turn of all) {
      const r = applyActions(state, [...(turn.board ?? []), ...(turn.hintBoard ?? [])]);
      state = r.state;
      for (const p of r.prims) {
        if (p.kind === "text") assert.ok(Number.isFinite(p.x) && Number.isFinite(p.y), `${demo.demoId}: bad text pos`);
        if (p.kind === "path") for (const seg of p.paths) for (const pt of seg) assert.ok(pt.every(Number.isFinite), `${demo.demoId}: NaN path`);
      }
    }
  }
});

test("match ignores spacing and dash style", async () => {
  const { findLoose } = await import("../lib/board");
  assert.deepEqual(findLoose("y = x² − 4x + 1", "−4x"), [7, 11]);
  assert.deepEqual(findLoose("10 − 0.5Q = 2 + 0.5Q", "-0.5q"), [3, 9]);
  assert.equal(findLoose("abc", "zz"), null);
  const s1 = applyActions(emptyBoard(), [{ type: "write", id: "eq", text: "y = x² − 4x + 1" }]).state;
  assert.equal(applyActions(s1, [{ type: "circle", target: "eq", match: "−4x", text: "b = −4" }]).prims.length, 2);
});

test("numberLine parses intervals and inequalities", async () => {
  const { parseInterval } = await import("../lib/board");
  assert.deepEqual(parseInterval("I: (0, 3]"), { name: "I", lo: 0, hi: 3, loClosed: false, hiClosed: true });
  assert.deepEqual(parseInterval("[−3, ∞)"), { name: "", lo: -3, hi: Infinity, loClosed: true, hiClosed: false });
  assert.equal(parseInterval("x ≥ 4")?.lo, 4);
  assert.equal(parseInterval("nonsense"), null);
  const r = applyActions(emptyBoard(), [{ type: "numberLine", id: "nl", items: ["I: (0, 3]", "J: (-3, 2)"], text: "Number line" }]);
  assert.ok(r.state.els.nl && r.state.els["nl.1"]);
});

test("point labels on the same spot don't overlap", () => {
  const r = applyActions(emptyBoard(), [
    { type: "graph", id: "g", xMin: -4, xMax: 4, yMin: -1, yMax: 1 },
    { type: "point", target: "g", x: 0, y: 0, text: "0 (open)" },
    { type: "point", target: "g", x: 0.3, y: 0, text: "3 (closed)" },
  ]);
  const labels = r.prims.filter((p) => p.kind === "text" && /open|closed/.test(p.text)) as { x: number; y: number; w: number }[];
  const [a, b] = labels;
  const overlap = a.x < b.x + b.w && a.x + a.w > b.x && Math.abs(a.y - b.y) < 20;
  assert.ok(!overlap);
});

test("number lines build row by row, with addressable endpoints and symbol-to-dot arrows", () => {
  const r = applyActions(emptyBoard(), [
    { type: "write", id: "i", text: "I = (0, 3]", size: "lg" },
    { type: "numberLine", id: "nl", items: [], xMin: -4, xMax: 4, text: "" },
    { type: "interval", target: "nl", text: "I: (0, 3]", color: "blue" },
    { type: "interval", target: "nl", text: "J: (−3, 2)", color: "orange" },
    { type: "arrow", from: "i:(", to: "nl.1.lo" },
    { type: "arrow", from: "i:]", to: "nl.1.hi" },
    { type: "circle", target: "nl.2.hi", text: "not in J" },
  ]);
  for (const id of ["nl.1.lo", "nl.1.hi", "nl.1.bar", "nl.2.lo", "nl.2.hi"]) assert.ok(r.state.els[id], id);
  const arrows = r.prims.filter((p) => p.kind === "path").slice(-3, -1) as { paths: [number, number][][] }[];
  assert.notEqual(Math.round(arrows[0].paths[0][0][0]), Math.round(arrows[1].paths[0][0][0]));
  assert.match(describeBoard(r.state), /rows 1 = I: \(0, 3\], 2 = J/);
});

test("interval without a number line is ignored safely", () => {
  assert.doesNotThrow(() => applyActions(emptyBoard(), [{ type: "interval", target: "nope", text: "(0, 1)" }]));
});

test("flow chains grow row by row and mind maps take branches", () => {
  const add = (t: string) => ({ type: "add", target: "chain", text: t });
  const r = applyActions(emptyBoard(), [
    { type: "flow", id: "chain", text: "Chain", items: [], zone: "full" },
    add("one"), add("two"), add("three"), add("four"), add("five"), add("six"),
    { type: "mindmap", id: "mm", text: "Causes", items: ["A", "B"], zone: "full" },
    { type: "add", target: "mm", text: "C" },
  ] as never);
  for (const id of ["chain.1", "chain.6", "mm.center", "mm.3"]) assert.ok(r.state.els[id], id);
  const c6 = r.state.els["chain.6"].box;
  const mm = r.state.els["mm"].box;
  assert.ok(mm.y >= c6.y + c6.h, "mind map sits below the grown chain");
});

test("canvas + sketch can draw a clock (circle, labels, arc arrow)", () => {
  const r = applyActions(emptyBoard(), [
    { type: "canvas", id: "clk", zone: "left", text: "i-clock" },
    { type: "sketch", id: "face", target: "clk", kind: "circle", x: 50, y: 50, r: 38 },
    { type: "sketch", id: "top", target: "clk", kind: "text", x: 50, y: 18, text: "i" },
    { type: "sketch", id: "", target: "clk", kind: "arc", x: 50, y: 50, r: 28, x2: 20, y2: 340, text: "× i each step" },
    { type: "sketch", id: "", target: "clk", kind: "polygon", items: ["10,90", "30,90", "20,70"] },
    { type: "sketch", id: "", target: "missing", kind: "bogus" },
  ] as never);
  assert.ok(r.state.els.face && r.state.els.top && r.state.els["clk.3"]);
  assert.match(describeBoard(r.state), /drawing area "i-clock"/);
  for (const p of r.prims) if (p.kind === "path") for (const seg of p.paths) for (const pt of seg) assert.ok(pt.every(Number.isFinite));
});

test("exponents: caret becomes superscript, matching still finds it", async () => {
  const { segments, caretToUnicode } = await import("../lib/mathtext");
  assert.equal(caretToUnicode("i^142"), "i¹⁴²");
  assert.deepEqual(segments("i¹⁴²"), [{ t: "i", k: "n" }, { t: "142", k: "sup" }]);
  assert.deepEqual(segments("H₂O").map((s) => s.k), ["n", "sub", "n"]);
  const r = applyActions(emptyBoard(), [{ type: "write", id: "e", text: "Simplify i^142" }, { type: "circle", target: "e", match: "142" }]);
  assert.equal(r.prims.filter((p) => p.kind === "path").length, 1);
});

test("caret groups with spaces become superscripts", async () => {
  const { caretToUnicode } = await import("../lib/mathtext");
  assert.equal(caretToUnicode("i^(140 + 2)"), "i⁽¹⁴⁰⁺²⁾");
});

test("beat badges never sit on top of writing", async () => {
  const { badgeSpot } = await import("../lib/board");
  const r = applyActions(emptyBoard(), [
    { type: "write", id: "a", text: "Current ratio = ?", size: "lg" },
    { type: "write", id: "f", text: "Current ratio = Current Assets ÷ Current Liabilities" },
  ]);
  const hl = applyActions(r.state, [{ type: "highlight", target: "f", match: "Current Assets ÷ Current" }]);
  const box = (hl.prims[0] as { x: number; y: number; w: number; h: number });
  const spot = badgeSpot(hl.state, box, [{ x: 18, y: 60 }]);
  for (const id of ["a", "f"]) {
    const b = hl.state.els[id].box;
    const overlap = spot.x + 13 > b.x && spot.x - 13 < b.x + b.w && spot.y + 13 > b.y && spot.y - 13 < b.y + b.h;
    assert.ok(!overlap, `badge overlaps ${id}`);
  }
});

// Every piece of text on the board, as a rectangle (baseline y, so the glyphs sit above it).
function textBoxes(prims: import("../lib/board").Prim[], acc: { x: number; y: number; w: number; h: number; t: string }[] = []) {
  for (const p of prims) {
    if (p.kind === "clear") acc.length = 0;
    if (p.kind === "text" && p.text.trim()) acc.push({ x: p.x, y: p.y - p.size * 0.78, w: p.w, h: p.size * 0.95, t: p.text });
  }
  return acc;
}
function overlaps(boxes: ReturnType<typeof textBoxes>): string[] {
  const out: string[] = [];
  const pad = 2;
  for (let i = 0; i < boxes.length; i++)
    for (let j = i + 1; j < boxes.length; j++) {
      const a = boxes[i], b = boxes[j];
      if (a.x + pad < b.x + b.w - pad && b.x + pad < a.x + a.w - pad && a.y + pad < b.y + b.h - pad && b.y + pad < a.y + a.h - pad)
        out.push(`"${a.t}" × "${b.t}"`);
    }
  return out;
}

test("no text overlaps in any demo lesson", () => {
  for (const demo of DEMO_ASSIGNMENTS) {
    let state = emptyBoard();
    const boxes: ReturnType<typeof textBoxes> = [];
    for (const turn of demo.lesson.script) {
      const r = applyActions(state, [...(turn.board ?? [])]);
      state = r.state;
      textBoxes(r.prims, boxes);
      assert.deepEqual(overlaps(boxes), [], demo.demoId);
    }
  }
});

test("no text overlaps with long titles, labels and cells", () => {
  const long = "Classified = grouped into categories so readers can compare them";
  const cases: import("../lib/types").BoardAction[][] = [
    [{ type: "note", text: "Classified = grouped into categories", items: ["Assets: Current vs Long-term/Fixed", "Liabilities: Current vs Long-term"] }],
    [{ type: "box", text: long, items: [long, "short"] }, { type: "write", text: long }],
    [{ type: "note", zone: "right", text: long, items: [long] }, { type: "note", zone: "left", text: long, items: [long] }],
    [{ type: "table", headers: ["Account", "Classification with a long explanation"], rows: [[long, long], ["Cash", "Current"]] } as never],
    [{ type: "timeline", text: "Road to war", items: ["1914 June: Archduke Franz Ferdinand is shot", "July: Austria-Hungary declares war on Serbia", "Aug: Germany declares war on Russia and France", "Aug: Britain joins"] } as never],
    [{ type: "flow", text: long, items: ["Nationalism grows across the Balkans", "Assassination in Sarajevo", "Alliances pull everyone in", "World war"] } as never],
    [{ type: "mindmap", text: "Causes of WWI", items: ["Militarism and arms race", "Alliances", "Imperialism and colonies", "Nationalism", "Assassination"] } as never],
    [{ type: "tAccount", text: "Prepaid Insurance", debits: ["Oct 1 paid 12,000"], credits: ["Dec 31 adjust 3,000"] } as never],
    [{ type: "tAccount", text: "Accumulated Depreciation – Equipment", debits: ["1,000"], credits: ["Dec 31 adjust 3,000"] } as never],
    [{ type: "write", id: "eq", text: "3x + 7 = 22", size: "lg" }, { type: "circle", target: "eq", match: "3x", text: "first layer of wrapping" }, { type: "circle", target: "eq", match: "+ 7", text: "second layer of wrapping" }, { type: "balance", target: "eq", text: "− 7" }],
    [{ type: "write", text: "Current ratio = Current Assets ÷ Current Liabilities", size: "lg" }, { type: "note", text: long, items: ["a", "b"] }, { type: "write", text: long, size: "lg" }],
    [{ type: "graph", id: "g", xMin: -5, xMax: 5, yMin: -5, yMax: 5, text: "Supply and demand" }, { type: "plot", target: "g", fn: "x + 1", text: "Supply curve" }, { type: "plot", target: "g", fn: "3 - x", text: "Demand curve" }, { type: "point", target: "g", x: 1, y: 2, text: "Equilibrium" }, { type: "point", target: "g", x: 1.2, y: 2.1, text: "Nearby point" }] as never,
    [{ type: "numberLine", id: "nl", items: [], xMin: -4, xMax: 4, text: "Number line" }, { type: "interval", target: "nl", text: "I: (0, 3]" }, { type: "interval", target: "nl", text: "J: (−3, 2)" }, { type: "interval", target: "nl", text: "I ∩ J: (0, 2)" }] as never,
    [{ type: "write", zone: "left", text: long }, { type: "write", zone: "right", text: long }, { type: "note", zone: "right", text: long, items: [long] }, { type: "write", zone: "full", text: long }] as never,
  ];
  for (const actions of cases) {
    const r = applyActions(emptyBoard(), actions);
    assert.deepEqual(overlaps(textBoxes(r.prims)), [], JSON.stringify(actions).slice(0, 80));
  }
});

test("voice picker ids map only to known voices", async () => {
  const { elevenVoiceId, NATURAL_VOICES, DEFAULT_VOICE } = await import("../lib/voices");
  assert.equal(elevenVoiceId(DEFAULT_VOICE), "JBFqnCBsd6RMkjVDRZzb");
  assert.equal(elevenVoiceId("../../v1/user"), null);
  assert.equal(new Set(NATURAL_VOICES.map((v) => v.eleven)).size, NATURAL_VOICES.length);
});

test("pointTo flies to a substring, a table cell or a graph spot, and draws nothing permanent", () => {
  const r = applyActions(emptyBoard(), [
    { type: "write", id: "eq1", text: "3x + 7 = 22", size: "lg" },
    { type: "table", id: "je", headers: ["Account", "Debit"], rows: [["Expense", "3,000"]] },
    { type: "graph", id: "g1", zone: "right", xMin: 0, xMax: 20, yMin: 0, yMax: 12 },
    { type: "pointTo", target: "eq1", match: "22", text: "still needs − 7" },
    { type: "pointTo", target: "je.1.1", match: "", text: "debit" },
    { type: "pointTo", target: "g1", match: "8,6", text: "they agree" },
    { type: "pointTo", target: "missing", match: "zzz", text: "nope" },
  ] as never);
  const pts = r.prims.filter((p) => p.kind === "point") as Extract<import("../lib/board").Prim, { kind: "point" }>[];
  assert.equal(pts.length, 3);
  const eq = r.state.els.eq1 as { box: { x: number; w: number } };
  assert.ok(pts[0].x > eq.box.x + eq.box.w * 0.6, "points at the 22, not the start of the line");
  assert.equal(pts[1].label, "debit");
  const g = r.state.els.g1 as { plot: { x: number; y: number; w: number; h: number } };
  assert.ok(Math.abs(pts[2].x + 9 - (g.plot.x + g.plot.w * 0.4)) < 1 && Math.abs(pts[2].y + 9 - (g.plot.y + g.plot.h * 0.5)) < 1);
  const { primsBox } = require("../lib/board");
  assert.equal(primsBox(pts), null, "pointing never gets a badge or counts as drawing");
});

test("the pointer's label bubble never covers writing", () => {
  const cases: import("../lib/types").BoardAction[][] = [
    [{ type: "write", id: "eq1", text: "3x + 7 = 22", size: "lg" }, { type: "balance", target: "eq1", text: "− 7" }, { type: "pointTo", target: "eq1", match: "22", text: "still needs − 7" }],
    [{ type: "write", id: "a", text: "Current ratio = Current Assets ÷ Current Liabilities" }, { type: "write", text: "Quick ratio = (Cash + Receivables) ÷ Current Liabilities" }, { type: "pointTo", target: "a", match: "Current Assets", text: "what you own soon" }],
    [{ type: "table", id: "je", zone: "full", headers: ["Date", "Account", "Debit", "Credit"], rows: [["Dec 31", "Insurance Expense", "3,000", ""], ["", "Prepaid Insurance", "", "3,000"]] }, { type: "pointTo", target: "je.1.2", match: "", text: "debit: expense ↑" }, { type: "pointTo", target: "je.2.3", match: "", text: "credit: asset ↓" }],
  ] as never;
  for (const actions of cases) {
    const r = applyActions(emptyBoard(), actions);
    const texts = textBoxes(r.prims);
    for (const p of r.prims) {
      if (p.kind !== "point" || !p.spot) continue;
      const b = { x: p.spot.bx, y: p.spot.by, w: p.spot.bw, h: p.spot.bh };
      const hit = texts.filter((t) => b.x < t.x + t.w - 2 && b.x + b.w > t.x + 2 && b.y < t.y + t.h - 2 && b.y + b.h > t.y + 2);
      assert.deepEqual(hit.map((t) => t.t), [], `bubble "${p.label}"`);
    }
  }
});

test("pointTo never jumps to a look-alike elsewhere on the board", async () => {
  const { shortLabel } = await import("../lib/board");
  const pts = (acts: Parameters<typeof applyActions>[1]) =>
    applyActions(emptyBoard(), acts).prims.filter((p) => p.kind === "point") as { x: number; y: number; w: number; h: number; label: string }[];
  const econ: Parameters<typeof applyActions>[1] = [
    { type: "write", id: "d", text: "Demand: P = 10 − 0.5Q" },
    { type: "graph", id: "g1", zone: "right", xMin: 0, xMax: 16, yMin: 0, yMax: 12, xLabel: "Quantity", yLabel: "Price", text: "" },
    { type: "point", target: "g1", x: 8, y: 6, text: "E (8, 6)" },
  ];
  const board = applyActions(emptyBoard(), econ).state;
  const g = board.els.g1.box;
  // "E" isn't a word inside the graph: ring the graph, not the "e" in "Demand".
  const [p] = pts([...econ, { type: "pointTo", target: "g1", match: "E", text: "equilibrium" }]);
  assert.ok(p.x >= g.x - 4 && p.x + p.w <= g.x + g.w + 4, "stays on the graph");
  // Unknown id + a single character: too ambiguous to guess, so don't point at all.
  assert.equal(pts([...econ, { type: "pointTo", target: "nope", match: "E", text: "?" }]).length, 0);
  // Unknown id + real words: find the words.
  const [w] = pts([...econ, { type: "pointTo", target: "nope", match: "10 − 0.5Q", text: "demand" }]);
  assert.ok(w && w.y < g.y + g.h && w.x < 580, "lands on the demand equation");
  // A match inside a flow's pieces lands on that piece, not on the whole chain.
  const flow: Parameters<typeof applyActions>[1] = [
    { type: "flow", id: "ch", text: "Chain", items: [], zone: "full" },
    { type: "add", target: "ch", text: "Austria attacks Serbia" },
    { type: "add", target: "ch", text: "Russia mobilizes" },
  ];
  const s = applyActions(emptyBoard(), flow).state;
  const [f] = pts([...flow, { type: "pointTo", target: "ch", match: "Russia", text: "Serbia's ally" }]);
  const piece = s.els["ch.2"].box;
  assert.ok(f.x >= piece.x - 2 && f.x + f.w <= piece.x + piece.w + 2, "on the Russia box");
  // Long labels are cut at a word, never mid-word.
  assert.equal(shortLabel("the point where both curves finally cross", 28), "the point where both curves…");
  assert.equal(shortLabel("your turn", 28), "your turn");
});

test("pointing at part of a line never parks the cursor on the rest of that line", async () => {
  const { approxMeasure } = await import("../lib/board");
  for (const [text, match] of [["3x + 7 = 22", "+ 7"], ["3x + 7 = 22", "3x"], ["10 − 0.5Q = 2 + 0.5Q", "2"], ["Demand: P = 10 − 0.5Q", "10"]]) {
    const { state, prims } = applyActions(emptyBoard(), [
      { type: "write", id: "eq1", text, size: "lg" },
      { type: "balance", target: "eq1", text: "− 7" },
      { type: "pointTo", target: "eq1", match, text: "cancels out" },
    ]);
    const el = state.els.eq1 as { lines: { x: number; y: number; size: number; text: string }[] };
    const line = el.lines[0];
    const at = line.text.indexOf(match);
    const others = [
      { x: line.x, w: approxMeasure(line.text.slice(0, at).trimEnd(), line.size) },
      { x: line.x + approxMeasure(line.text.slice(0, at + match.length + 1), line.size), w: approxMeasure(line.text.slice(at + match.length + 1), line.size) },
    ]
      .filter((o) => o.w > 2)
      .map((o) => ({ ...o, y: line.y - line.size * 0.82, h: line.size }));
    const p = prims.find((q) => q.kind === "point") as { spot: { tip: [number, number]; rot: number; bx: number; by: number; bw: number; bh: number } };
    const a = (p.spot.rot * Math.PI) / 180;
    const body = { x: p.spot.tip[0] - Math.sin(a) * 14 - 8, y: p.spot.tip[1] + Math.cos(a) * 14 - 8, w: 16, h: 16 };
    const bubble = { x: p.spot.bx, y: p.spot.by, w: p.spot.bw, h: p.spot.bh };
    const ov = (r: typeof body, o: typeof body) => Math.min(r.x + r.w, o.x + o.w) - Math.max(r.x, o.x) > 1 && Math.min(r.y + r.h, o.y + o.h) - Math.max(r.y, o.y) > 1;
    for (const o of others) {
      assert.ok(!ov(body, o), `cursor covers the rest of "${text}" when pointing at "${match}"`);
      assert.ok(!ov(bubble, o), `label covers the rest of "${text}" when pointing at "${match}"`);
    }
  }
});

test("pointing at a big box keeps the cursor and label off the words inside it", () => {
  const acts: Parameters<typeof applyActions>[1] = [{ type: "flow", id: "ch", text: "Chain", items: [], zone: "full" }];
  for (const t of ["Austria attacks Serbia", "Russia mobilizes", "Germany → Russia, France", "Germany invades Belgium", "Britain declares war"]) acts.push({ type: "add", target: "ch", text: t });
  const { state, prims } = applyActions(emptyBoard(), [...acts, { type: "pointTo", target: "ch.4", match: "", text: "the trigger" }]);
  const el = state.els["ch.4"] as { lines: { x: number; y: number; size: number; text: string }[] };
  const words = el.lines.map((l) => ({ x: l.x, y: l.y - l.size * 0.82, w: l.text.length * l.size * 0.5, h: l.size }));
  const p = prims.find((q) => q.kind === "point") as { spot: { tip: [number, number]; bx: number; by: number; bw: number; bh: number } };
  const ov = (r: { x: number; y: number; w: number; h: number }, o: typeof r) => Math.min(r.x + r.w, o.x + o.w) - Math.max(r.x, o.x) > 1 && Math.min(r.y + r.h, o.y + o.h) - Math.max(r.y, o.y) > 1;
  const tip = { x: p.spot.tip[0] - 2, y: p.spot.tip[1] - 2, w: 4, h: 4 };
  for (const w of words) {
    assert.ok(!ov(tip, w), "cursor tip sits on the box's words");
    assert.ok(!ov({ x: p.spot.bx, y: p.spot.by, w: p.spot.bw, h: p.spot.bh }, w), "label covers the box's words");
  }
});

test("pointer labels never cover writing in any scripted eval session or demo lesson", async () => {
  const { readdirSync, readFileSync } = await import("node:fs");
  const dir = new URL("../docs/eval/sim/", import.meta.url);
  const scripts: { name: string; turns: { board: Parameters<typeof applyActions>[1] }[] }[] = readdirSync(dir)
    .filter((f: string) => f.endsWith(".json"))
    .map((f: string) => ({ name: f, turns: JSON.parse(readFileSync(new URL(f, dir), "utf8")) }));
  for (const demo of DEMO_ASSIGNMENTS) scripts.push({ name: demo.demoId, turns: demo.lesson.script.map((t) => ({ board: t.board ?? [] })) });
  const ov = (r: { x: number; y: number; w: number; h: number }, o: typeof r, m = 0) =>
    Math.min(r.x + r.w, o.x + o.w) - Math.max(r.x, o.x) > m && Math.min(r.y + r.h, o.y + o.h) - Math.max(r.y, o.y) > m;
  let checked = 0;
  for (const sc of scripts) {
    let state = emptyBoard();
    let written: { x: number; y: number; w: number; h: number }[] = [];
    for (const turn of sc.turns) {
      for (const action of turn.board) {
        const res = applyActions(state, [action]);
        state = res.state;
        const before = { ink: written };
        for (const p of res.prims) {
          if (p.kind === "clear") written = [];
          if (p.kind === "text") written = [...written, { x: p.x, y: p.y - p.size * 0.85, w: p.w, h: p.size * 1.1 }];
          if (p.kind !== "point" || !p.spot || !p.label) continue;
          checked++;
          const target = { x: p.x, y: p.y, w: p.w, h: p.h };
          const bubble = { x: p.spot.bx, y: p.spot.by, w: p.spot.bw, h: p.spot.bh };
          for (const ink of before.ink) {
            if (ov(ink, target, -2)) continue; // the thing being pointed at (and its own line)
            assert.ok(!ov(bubble, ink, 2), `${sc.name}: label "${p.label}" covers writing at ${Math.round(ink.x)},${Math.round(ink.y)}`);
          }
        }
      }
    }
  }
  assert.ok(checked >= 25, `checked ${checked} pointer labels`);
});

test("balance after the next line is already written goes beside the equation, not on top", () => {
  const r = applyActions(emptyBoard(), [
    { type: "write", id: "eq1", text: "3x + 7 = 22", size: "lg" },
    { type: "write", id: "eq2", text: "3x = 15", size: "lg" },
    { type: "balance", target: "eq1", text: "− 7" },
  ] as never);
  assert.deepEqual(overlaps(textBoxes(r.prims)), []);
  assert.ok(r.prims.some((p) => p.kind === "text" && /− 7 on both sides/.test(p.text)));
});

test("cues: each action is timed to where its words are spoken", async () => {
  const { cueFractions } = await import("../lib/cue");
  const [c] = cueFractions("I'm circling the plus 7 because it was the last thing added.", [{ type: "circle", target: "eq1", match: "+ 7" }] as never);
  assert.ok(c > 0.25 && c < 0.45, `circle at ${c}`); // "plus 7" is ~37% of the way in
  const [p] = cueFractions("First the equation, and look at the 22 on the right.", [{ type: "pointTo", target: "eq1", match: "22" }] as never);
  assert.ok(p > 0.5, `pointer at ${p}`);
  const spread = cueFractions("Here we go.", [{ type: "write", text: "zzz" }, { type: "write", text: "qqq" }, { type: "write", text: "vvv" }] as never);
  assert.ok(spread[0] === 0 && spread[1] > 0 && spread[2] > spread[1], "unmentioned actions are spread through the line");
});

test("a circle paired with the wrong sentence moves to the sentence that names it", async () => {
  const { shiftMarks, cueFractions } = await import("../lib/cue");
  // What happened live: the circle came with "get x alone", before the line that explains it.
  const b1 = { text: "We want to get x alone on one side.", actions: [{ type: "circle", target: "eq1", match: "+ 7", text: "undo this first" }] } as never as { text: string; actions: import("../lib/types").BoardAction[] };
  const b2 = { text: "The plus 7 was added last, so it's the first thing we undo.", actions: [] as import("../lib/types").BoardAction[] };
  shiftMarks(b1, b2);
  assert.equal(b1.actions.length, 0);
  assert.equal(b2.actions.length, 1);
  const [c] = cueFractions(b2.text, b2.actions);
  assert.ok(c > 0.05 && c < 0.3, `lands on "plus 7" (${c})`);
  // A mark nobody names goes at the end of its line, never the start.
  const [late] = cueFractions("We want to get x alone on one side.", [{ type: "circle", target: "eq1", match: "+ 7" }] as never);
  assert.ok(late >= 0.8, `unexplained circle waits (${late})`);
  // Content that IS explained by its own line stays put.
  const b3 = { text: "I circle the 3x because it's the inner layer.", actions: [{ type: "circle", match: "3x" }] } as never as typeof b2;
  const b4 = { text: "Now the 3x is alone.", actions: [] as import("../lib/types").BoardAction[] };
  shiftMarks(b3, b4);
  assert.equal(b3.actions.length, 1);
});
