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
