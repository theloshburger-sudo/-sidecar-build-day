import { test } from "node:test";
import assert from "node:assert/strict";
import { gridFromImage, snapBox } from "../lib/screen-snap";

/** A 300x180 px page (100x60 cells of 3 px) with a few "words" drawn as dark blocks, given in cells. */
function page(blocks: [number, number, number, number][]) {
  const w = 300, h = 180;
  const px = new Uint8ClampedArray(w * h * 4).fill(255);
  for (const [c0, r0, c1, r1] of blocks) for (let y = r0 * 3; y < (r1 + 1) * 3; y++) for (let x = c0 * 3; x < (c1 + 1) * 3; x++) px.set([40, 40, 40, 255], (y * w + x) * 4);
  return gridFromImage(px, w, h, 3);
}

test("a box that's a little off snaps onto the word it was aiming at", () => {
  // the word "8,000": cells 40..52 x 20..23  →  px 120..159 x 60..72
  const g = page([[40, 20, 52, 23], [10, 20, 30, 23]]);
  const s = snapBox(g, { x1: 130, y1: 55, x2: 175, y2: 80 });
  assert.ok(Math.abs(s.x1 - 120) <= 4 && Math.abs(s.x2 - 159) <= 4, `x ${s.x1}-${s.x2}`);
  assert.ok(Math.abs(s.y1 - 60) <= 4 && Math.abs(s.y2 - 72) <= 4, `y ${s.y1}-${s.y2}`);
});

test("letters of one word join up, but the neighbouring word and the next line stay out", () => {
  // two letters with a 1-cell gap = one word; another word 6 cells away; a line below
  const g = page([[40, 20, 44, 23], [46, 20, 50, 23], [57, 20, 65, 23], [40, 27, 70, 30]]);
  const s = snapBox(g, { x1: 118, y1: 58, x2: 150, y2: 70 });
  assert.ok(s.x2 <= 156, `stopped before the next word (x2 ${s.x2})`);
  assert.ok(s.y2 <= 74, `stopped before the next line (y2 ${s.y2})`);
});

test("a box on blank page is left alone", () => {
  const g = page([[10, 10, 20, 12]]);
  const b = { x1: 200, y1: 100, x2: 260, y2: 130 };
  assert.deepEqual(snapBox(g, b), b);
});

test("a box touching a big paragraph doesn't balloon over the whole paragraph", () => {
  const g = page([[5, 5, 95, 40]]);
  const b = { x1: 120, y1: 60, x2: 150, y2: 72 };
  const s = snapBox(g, b);
  assert.ok((s.x2 - s.x1) * (s.y2 - s.y1) <= 4 * (30 * 12), "stayed close to the original size");
});

test("a thin grey input-box border counts as content, so a box snaps onto the field", () => {
  const w = 300, h = 180;
  const px = new Uint8ClampedArray(w * h * 4).fill(255);
  // a 1 px #888 outline around x 150..210, y 90..104
  for (let x = 150; x <= 210; x++) for (const y of [90, 104]) px.set([136, 136, 136, 255], (y * w + x) * 4);
  for (let y = 90; y <= 104; y++) for (const x of [150, 210]) px.set([136, 136, 136, 255], (y * w + x) * 4);
  const s = snapBox(gridFromImage(px, w, h, 3), { x1: 145, y1: 84, x2: 222, y2: 110 });
  assert.ok(Math.abs(s.x1 - 150) <= 3 && Math.abs(s.x2 - 211) <= 3, `x ${s.x1}-${s.x2}`);
  assert.ok(Math.abs(s.y1 - 90) <= 3 && Math.abs(s.y2 - 105) <= 3, `y ${s.y1}-${s.y2}`);
});

test("text the aim only grazes (the next line, a neighbouring word) is left out", () => {
  // "8,000" on cells 40..52 x 20..23; "8,700" right below on 40..52 x 26..29; "input." to the right at 60..70
  const g = page([[40, 20, 52, 23], [40, 26, 52, 29], [60, 20, 70, 23]]);
  const s = snapBox(g, { x1: 115, y1: 56, x2: 182, y2: 81 }); // covers 8,000 fully, the top row of 8,700, the left edge of "input."
  assert.ok(Math.abs(s.y2 - 72) <= 4, `stopped at the line (y2 ${s.y2})`);
  assert.ok(s.x2 <= 162, `stopped before "input." (x2 ${s.x2})`);
});

test("a box aimed too far left still lands on its word", () => {
  const g = page([[40, 20, 52, 23]]); // px 120..159
  const s = snapBox(g, { x1: 95, y1: 58, x2: 135, y2: 72 }); // covers only the left third of the word
  assert.ok(Math.abs(s.x1 - 120) <= 3 && Math.abs(s.x2 - 159) <= 3, `x ${s.x1}-${s.x2}`);
});

test("inkUnder counts content cells under a rectangle", async () => {
  const { inkUnder } = await import("../lib/screen-snap");
  const g = page([[40, 20, 52, 23]]); // px 120..159 x 60..72
  assert.ok(inkUnder(g, 120, 60, 39, 12) > 40);
  assert.equal(inkUnder(g, 200, 100, 40, 12), 0);
});
