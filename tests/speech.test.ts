import { test } from "node:test";
import assert from "node:assert/strict";
import { speakable } from "../lib/speech";

test("speakable turns board math into words", () => {
  assert.equal(speakable("3x + 7 = 22"), "3x + 7 equals 22");
  assert.equal(speakable("22 − 7"), "22 minus 7");
  assert.equal(speakable("x² ÷ 2"), "x squared divided by 2");
});

test("isEcho ignores Teacher's own voice but not the student's", async () => {
  const { isEcho } = await import("../lib/speech");
  const line = "First I'll circle the 3x, because it was the last thing done to x.";
  assert.equal(isEcho("circle the 3x because", line), true);
  assert.equal(isEcho("wait why do we subtract first", line), false);
  assert.equal(isEcho("hold on", ""), false);
});

test("exponents are spoken as powers", () => {
  assert.match(speakable("Simplify i¹⁴²"), /i to the power of 142/);
  assert.match(speakable("x^2 + 1"), /x squared/);
});
