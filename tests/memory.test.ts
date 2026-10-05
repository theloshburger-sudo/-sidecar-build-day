import { test } from "node:test";
import assert from "node:assert/strict";
import { LocalMemory } from "../lib/memory";

function fakeStorage() {
  const m = new Map<string, string>();
  return {
    getItem: (k: string) => m.get(k) ?? null,
    setItem: (k: string, v: string) => void m.set(k, v),
    removeItem: (k: string) => void m.delete(k),
    m,
  };
}

const concept = { slug: "inverse-operations", label: "Inverse operations", subject: "Algebra" };

test("a session's first event moves the schedule once; retries don't double-count", async () => {
  const mem = new LocalMemory(fakeStorage());
  await mem.recordSession({ id: "s1", title: "3x+7=22", subject: "Algebra", concept, event: "miss" });
  await mem.recordSession({ id: "s1", concept, event: "miss" });
  const [c] = await mem.concepts();
  assert.equal(c.misses, 1);
  assert.equal(c.step, 0);
  await mem.recordSession({ id: "s2", concept, event: "hit" });
  assert.equal((await mem.concepts())[0].hits, 1);
});

test("recaps are written when a session gets a result, newest first, updated in place", async () => {
  const mem = new LocalMemory(fakeStorage());
  await mem.recordSession({ id: "s1", title: "A", subject: "Algebra", concept, event: "miss" });
  assert.equal((await mem.recaps()).length, 0);
  await mem.recordSession({ id: "s1", title: "A", subject: "Algebra", gap: "Inverse ops", result: "Finished" });
  await mem.recordSession({ id: "s2", title: "B", subject: "Algebra", result: "Finished" });
  await mem.recordSession({ id: "s1", result: "Solved the practice problem ✓" });
  const r = await mem.recaps();
  assert.deepEqual(r.map((x) => [x.title, x.result]), [["B", "Finished"], ["A", "Solved the practice problem ✓"]]);
  assert.equal(r[1].gap, "Inverse ops");
});

test("notes dedupe, keep the newest 10, and forget clears everything", async () => {
  const s = fakeStorage();
  const mem = new LocalMemory(s);
  assert.deepEqual(await mem.addNote("Wants the reason behind each step."), ["Wants the reason behind each step"]);
  assert.equal(await mem.addNote("wants the reason behind each step"), null);
  for (let i = 0; i < 12; i++) await mem.addNote(`Habit number ${i}`);
  const notes = await mem.notes();
  assert.equal(notes.length, 10);
  assert.equal(notes[0], "Habit number 11");
  await mem.recordSession({ id: "s1", concept, event: "miss", result: "x" });
  await mem.forget();
  assert.deepEqual([await mem.notes(), await mem.concepts(), await mem.recaps()], [[], [], []]);
});

test("reads the old on-device keys (notes and recaps from before accounts)", async () => {
  const s = fakeStorage();
  s.setItem("sidecar.learner.v1", JSON.stringify(["Likes analogies"]));
  s.setItem("sidecar.recaps.v1", JSON.stringify([{ date: "2026-09-20T10:00:00.000Z", title: "Old", subject: "", gap: "", result: "Finished" }]));
  const mem = new LocalMemory(s);
  assert.deepEqual(await mem.notes(), ["Likes analogies"]);
  assert.equal((await mem.recaps())[0].title, "Old");
});
