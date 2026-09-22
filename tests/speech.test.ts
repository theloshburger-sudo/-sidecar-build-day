import { test } from "node:test";
import assert from "node:assert/strict";
import { speakable } from "../lib/speech";

test("speakable turns board math into words", () => {
  assert.equal(speakable("3x + 7 = 22"), "3x + 7 equals 22");
  assert.equal(speakable("22 − 7"), "22 minus 7");
  assert.equal(speakable("x² ÷ 2"), "x squared divided by 2");
});
