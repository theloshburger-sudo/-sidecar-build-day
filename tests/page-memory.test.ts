import { test } from "node:test";
import assert from "node:assert/strict";
import { PageMemory, signatureDiff } from "../lib/page-memory";

const sig = (fill: (i: number) => number) => Uint8Array.from({ length: 32 * 18 }, (_, i) => fill(i));
const top = sig((i) => (i < 200 ? 30 : 250)); // text near the top
const top2 = sig((i) => (i < 200 ? 32 : 249)); // same view, a little JPEG/cursor noise
const lower = sig((i) => (i > 380 ? 30 : 250)); // scrolled down: text near the bottom

test("signatureDiff: same view ≈ 0, different view large", () => {
  assert.ok(signatureDiff(top, top2) < 1.5);
  assert.ok(signatureDiff(top, lower) > 40);
});

test("a view is kept once; scrolling to a new part adds it; coming back doesn't duplicate", () => {
  const m = new PageMemory<string>(4);
  assert.equal(m.offer(top, () => "A"), true);
  assert.equal(m.offer(top2, () => "A again"), false);
  assert.equal(m.offer(lower, () => "B"), true);
  assert.equal(m.offer(top, () => "A again"), false);
  assert.deepEqual(m.views().map((v) => v.data), ["A", "B"]);
});

test("earlier views exclude the one on screen now, newest kept when full", () => {
  const m = new PageMemory<string>(2);
  const views = [0, 1, 2].map((k) => sig((i) => (Math.floor(i / 192) === k ? 30 : 250)));
  views.forEach((s, k) => m.offer(s, () => `V${k}`));
  assert.deepEqual(m.views().map((v) => v.data), ["V1", "V2"]);
  assert.deepEqual(m.others(views[2]).map((v) => v.data), ["V1"]);
});

test("two views of a mostly-white page (sparse text) still count as different", () => {
  const blank = () => new Uint8Array(64 * 36).fill(250);
  const a = blank(), b = blank();
  for (let i = 0; i < 160; i++) a[64 * 8 + i] = 200; // a few faint text lines near the top
  for (let i = 0; i < 160; i++) b[64 * 24 + i] = 200; // after scrolling: lines lower down
  assert.ok(signatureDiff(a, b) > 1.5, `diff ${signatureDiff(a, b)}`);
  const cursor = Uint8Array.from(a);
  for (let i = 0; i < 6; i++) cursor[64 * 30 + i] = 20; // only the mouse pointer moved
  assert.ok(signatureDiff(a, cursor) < 1.5);
});
