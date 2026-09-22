import { test } from "node:test";
import assert from "node:assert/strict";
import { normalizeTurn, splitProblems } from "../lib/sanitize";

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
