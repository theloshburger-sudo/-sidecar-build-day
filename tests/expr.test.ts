import { test } from "node:test";
import assert from "node:assert/strict";
import { compileExpression } from "../lib/expr";

const f = (s: string, x: number) => compileExpression(s)!(x);

test("basic arithmetic and precedence", () => {
  assert.equal(f("2x+1", 3), 7);
  assert.equal(f("(x-2)^2-3", 5), 6);
  assert.equal(f("-x^2", 3), -9);
  assert.equal(f("10-0.5x", 8), 6);
  assert.equal(f("2^3^2", 0), 512);
});

test("implicit multiplication, functions, prefixes, unicode", () => {
  assert.equal(f("3(x+1)", 1), 6);
  assert.equal(f("x(x-1)", 4), 12);
  assert.equal(f("sqrt(x)", 9), 3);
  assert.equal(f("y = 2x − 3", 2), 1);
  assert.equal(f("f(x)=x²", 3), 9);
  assert.ok(Math.abs(f("2sin(pi x/2)", 1) - 2) < 1e-9);
});

test("rejects unsafe or invalid input", () => {
  assert.equal(compileExpression("alert(1)"), null);
  assert.equal(compileExpression("x +"), null);
  assert.equal(compileExpression("process.exit()"), null);
});
