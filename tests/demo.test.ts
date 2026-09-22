import { test } from "node:test";
import assert from "node:assert/strict";
import { DEMO_ASSIGNMENTS } from "../lib/demo";
import { classifyInterrupt, demoReply, demoStart, matchesAnswer } from "../lib/demo-engine";

test("answer matching", () => {
  assert.ok(matchesAnswer("x = 5", ["5"]));
  assert.ok(matchesAnswer("$3,000", ["3000"]));
  assert.ok(!matchesAnswer("15", ["5"]));
  assert.ok(matchesAnswer("Subtract 7 first", ["subtract 7"]));
  assert.ok(!matchesAnswer("Divide by 3 first", ["subtract 7"]));
  assert.ok(matchesAnswer("10 = 2 + Q", ["10=2+q"]));
});

test("interrupt classification", () => {
  assert.equal(classifyInterrupt("Why did we divide there?"), "why");
  assert.equal(classifyInterrupt("Show that differently"), "differently");
  assert.equal(classifyInterrupt("slow down please"), "slower");
  assert.equal(classifyInterrupt("15"), null);
});

test("each demo can be completed by answering correctly", () => {
  for (const demo of DEMO_ASSIGNMENTS) {
    const lesson = demo.lesson;
    let { turn, state } = demoStart(lesson);
    assert.equal(turn.phase, "diagnose");
    let guard = 0;
    while (state.idx < lesson.script.length - 1 && guard++ < 30) {
      const cur = lesson.script[state.idx];
      const answer = cur.expect ? (cur.choices?.find((c) => matchesAnswer(c, cur.expect!)) ?? cur.expect[0]) : "ok";
      ({ turn, state } = demoReply(lesson, state, answer));
    }
    assert.equal(turn.phase, "wrapup", demo.demoId);
  }
});

test("each correct choice exists and is unique among choices", () => {
  for (const demo of DEMO_ASSIGNMENTS) {
    for (const t of demo.lesson.script) {
      if (!t.expect || !t.choices?.length) continue;
      const hits = t.choices.filter((c) => matchesAnswer(c, t.expect!));
      assert.equal(hits.length, 1, `${demo.demoId}: "${t.question}" has ${hits.length} matching choices`);
    }
  }
});

test("wrong answer gives a hint first, interrupt keeps position", () => {
  const lesson = DEMO_ASSIGNMENTS[0].lesson;
  let r = demoStart(lesson);
  r = demoReply(lesson, r.state, "Subtract 7 first");
  assert.equal(r.state.idx, 1);
  const hint = demoReply(lesson, r.state, "Add 7");
  assert.equal(hint.state.idx, 1);
  assert.equal(hint.turn.verdict, "incorrect");
  const why = demoReply(lesson, r.state, "why do we subtract first?");
  assert.equal(why.state.idx, 1);
  assert.ok(why.turn.question);
});
