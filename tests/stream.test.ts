import { test } from "node:test";
import assert from "node:assert/strict";
import { BoardStreamParser } from "../lib/stream-parse";
import { BeatBuilder, beatsFromTurn } from "../lib/narration";

test("stream parser yields actions as soon as each is complete", () => {
  const json = JSON.stringify({ board: [{ type: "narrate", text: "a {tricky} \"one\"" }, { type: "write", text: "x=[1]" }], say: "", phase: "teach" });
  const p = new BoardStreamParser();
  const got: unknown[] = [];
  for (let i = 0; i < json.length; i += 7) got.push(...p.feed(json.slice(i, i + 7)));
  assert.equal(got.length, 2);
  assert.deepEqual(got[1], { type: "write", text: "x=[1]" });
  assert.deepEqual(JSON.parse(p.text).phase, "teach");
});

test("beat builder groups actions under narrate lines", () => {
  const b = new BeatBuilder();
  b.push({ type: "narrate", text: "First." });
  b.push({ type: "write", text: "1" });
  b.push({ type: "narrate", text: "Second." });
  assert.equal(b.closed, 1);
  b.push({ type: "circle", target: "a" });
  b.end();
  assert.equal(b.beats.length, 2);
  assert.equal(b.beats[1].actions.length, 1);
});

test("turns without narrate are split by sentence", () => {
  const beats = beatsFromTurn({ say: "One. Two. Three.", board: [{ type: "write" }, { type: "write" }, { type: "clear" }] as never });
  assert.equal(beats.length, 3);
  assert.equal(beats[0].actions[0].type, "write");
  assert.ok(beats[0].actions.some((a) => a.type === "clear"));
});
