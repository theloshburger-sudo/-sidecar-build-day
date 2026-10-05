import { test } from "node:test";
import assert from "node:assert/strict";
import { normalizeTurn, splitProblems } from "../lib/sanitize";
import { firstMessage } from "../lib/prompt";

test("normalizeTurn fills defaults from junk", () => {
  const t = normalizeTurn({ phase: "weird", board: [null, { type: "write", text: "hi" }], choices: [1, "a"] });
  assert.equal(t.phase, "teach");
  assert.equal(t.board.length, 1);
  assert.deepEqual(t.choices, ["a"]);
  assert.equal(t.verdict, "none");
});

test("splitProblems splits numbered worksheets", () => {
  const ps = splitProblems("Unit 3 Worksheet\nName: ____\n1. Solve 2x = 4\n2. Solve x + 3 = 9\nQuestion 3: graph y = x");
  assert.equal(ps.length, 3);
  assert.match(ps[0].text, /2x = 4/);
});

test("splitProblems keeps a single problem whole", () => {
  const ps = splitProblems("What is the derivative of x squared times sin x?");
  assert.equal(ps.length, 1);
});

test("concept: slug is kebab-cased and dropped when empty; warmup is a real phase", () => {
  const t = normalizeTurn({ phase: "warmup", concept: { slug: "Interval Endpoints!!", label: "Open vs closed endpoints" } });
  assert.equal(t.phase, "warmup");
  assert.deepEqual(t.concept, { slug: "interval-endpoints", label: "Open vs closed endpoints" });
  assert.deepEqual(normalizeTurn({ concept: { slug: "  ", label: "x" } }).concept, { slug: "", label: "" });
  assert.deepEqual(normalizeTurn({}).concept, { slug: "", label: "" });
});

test("first message lists known concepts and the one warm-up, only when given", () => {
  const p = { id: "p1", title: "t", text: "Solve 2x+5=17", subject: "Algebra" };
  const prefs = { format: "visual", voice: false, focus: false, pace: "normal", speed: 1, voiceSpeed: 1 } as const;
  const plain = firstMessage(p, prefs);
  assert.ok(!/concept/i.test(plain) && !/warm-up/i.test(plain));
  const m = firstMessage(p, prefs, [], [{ slug: "inverse-operations", label: "Inverse operations" }], { slug: "interval-endpoints", label: "Open vs closed endpoints" });
  assert.match(m, /inverse-operations: Inverse operations/);
  assert.match(m, /warm-up.*interval-endpoints/is);
});
