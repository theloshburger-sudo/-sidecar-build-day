import { test } from "node:test";
import assert from "node:assert/strict";
import { applyEvent, dueConcept, isMastered, type Concept } from "../lib/review";

const DAY = 86_400_000;
const now = new Date("2026-10-04T12:00:00Z");
const ref = { slug: "interval-endpoints", label: "Open vs closed endpoints", subject: "Algebra" };

test("a miss on a new concept schedules a review in 2 days", () => {
  const c = applyEvent(undefined, ref, "miss", now);
  assert.equal(c.misses, 1);
  assert.equal(c.hits, 0);
  assert.equal(c.step, 0);
  assert.equal(new Date(c.nextReviewAt!).getTime() - now.getTime(), 2 * DAY);
});

test("hits walk the ladder 7d → 21d → 60d → mastered", () => {
  let c = applyEvent(undefined, ref, "miss", now);
  const gaps: (number | null)[] = [];
  for (let i = 0; i < 4; i++) {
    c = applyEvent(c, ref, "hit", now);
    gaps.push(c.nextReviewAt ? (new Date(c.nextReviewAt).getTime() - now.getTime()) / DAY : null);
  }
  assert.deepEqual(gaps, [7, 21, 60, null]);
  assert.ok(isMastered(c));
  assert.equal(c.hits, 4);
});

test("a miss resets the ladder but keeps the counts", () => {
  let c = applyEvent(undefined, ref, "miss", now);
  c = applyEvent(c, ref, "hit", now);
  c = applyEvent(c, ref, "hit", now);
  c = applyEvent(c, ref, "miss", now);
  assert.equal(c.step, 0);
  assert.equal(c.misses, 2);
  assert.equal(c.hits, 2);
  assert.ok(!isMastered(c));
});

test("dueConcept prefers the same subject, then the most overdue", () => {
  const mk = (slug: string, subject: string, daysAgo: number): Concept => ({
    ...applyEvent(undefined, { slug, label: slug, subject }, "miss", now),
    nextReviewAt: new Date(now.getTime() - daysAgo * DAY).toISOString(),
  });
  const list = [mk("a", "History", 9), mk("b", "Algebra", 1), mk("c", "Algebra", 3), { ...mk("d", "Algebra", 0), nextReviewAt: new Date(now.getTime() + DAY).toISOString() }];
  assert.equal(dueConcept(list, "algebra", now)?.slug, "c");
  assert.equal(dueConcept(list, "Chemistry", now)?.slug, "a");
  assert.equal(dueConcept([list[3]], "Algebra", now), null);
  const mastered = { ...mk("m", "Algebra", 5), step: 4, nextReviewAt: null };
  assert.equal(dueConcept([mastered], "Algebra", now), null);
});
