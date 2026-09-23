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
