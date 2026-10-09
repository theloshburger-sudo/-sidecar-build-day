import { test } from "node:test";
import assert from "node:assert/strict";
import { inkMapFromPixels, inkIn, overlaps, placeBox, sameMark, wrapNote, type Rect } from "../lib/screen-layout";

/** A 20x10-cell map (cell = 10 px → a 200x100 image) with "text" filling the left half. */
function leftHalfInk() {
  const cols = 20, rows = 10;
  const px = new Uint8ClampedArray(cols * rows * 4).fill(255);
  for (let r = 0; r < rows; r++) for (let c = 0; c < 10; c++) px.set([60, 60, 60, 255], (r * cols + c) * 4);
  return inkMapFromPixels(px, cols, rows, 10);
}

test("ink map marks cells with text or color, not blank page", () => {
  const map = leftHalfInk();
  assert.equal(inkIn(map, { x: 0, y: 0, w: 100, h: 100 }), 100);
  assert.equal(inkIn(map, { x: 100, y: 0, w: 100, h: 100 }), 0);
});

test("a label goes into blank space beside its mark, never over text", () => {
  const map = leftHalfInk();
  const anchor = { x: 80, y: 40, w: 20, h: 10 };
  const r = placeBox(map, anchor, { w: 40, h: 12 }, [], { w: 200, h: 100 });
  assert.equal(inkIn(map, r), 0);
  assert.ok(r.x >= 100);
  assert.ok(Math.abs(r.y + r.h / 2 - 45) <= 15, "stays near the mark");
});

test("labels never overlap each other or leave the image", () => {
  const map = leftHalfInk();
  const anchor = { x: 80, y: 40, w: 20, h: 10 };
  const taken: Rect[] = [];
  for (let i = 0; i < 4; i++) {
    const r = placeBox(map, anchor, { w: 40, h: 12 }, taken, { w: 200, h: 100 });
    assert.ok(taken.every((t) => !overlaps(t, r)), `label ${i} overlaps`);
    assert.ok(r.x >= 0 && r.y >= 0 && r.x + r.w <= 200 && r.y + r.h <= 100, `label ${i} out of bounds`);
    taken.push(r);
  }
});

test("near the right edge the label flips to the left instead of being cut off", () => {
  const blank = inkMapFromPixels(new Uint8ClampedArray(20 * 10 * 4).fill(255), 20, 10, 10);
  const r = placeBox(blank, { x: 185, y: 40, w: 10, h: 10 }, { w: 40, h: 12 }, [], { w: 200, h: 100 });
  assert.ok(r.x + r.w <= 200);
});

test("duplicate marks (same text, same spot) are recognized", () => {
  const a = { kind: "box", x: 700, y: 610, x2: 820, y2: 650, text: "variable" };
  assert.ok(sameMark(a, { ...a, x: 705, x2: 826 }));
  assert.ok(!sameMark(a, { ...a, text: "fixed" }));
  assert.ok(!sameMark(a, { ...a, x: 1100, x2: 1200 }));
});

test("notes wrap into short lines", () => {
  assert.deepEqual(wrapNote("MPL = change in output ÷ change in labor", 18), ["MPL = change in", "output ÷ change in", "labor"]);
});
