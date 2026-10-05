import { test } from "node:test";
import assert from "node:assert/strict";
import { assertSafeBaseUrl, decryptToken, encryptToken, htmlToText, mapPlanner } from "../lib/server/canvas";

const KEY = Buffer.alloc(32, 7).toString("base64");

test("token encryption round-trips and can't be read with another key", () => {
  const box = encryptToken("1234~secretCanvasToken", KEY);
  assert.ok(!box.includes("secretCanvasToken"));
  assert.equal(decryptToken(box, KEY), "1234~secretCanvasToken");
  assert.throws(() => decryptToken(box, Buffer.alloc(32, 8).toString("base64")));
  assert.notEqual(encryptToken("same", KEY), encryptToken("same", KEY)); // fresh IV each time
});

test("only public https Canvas hosts are allowed (SSRF guard)", async () => {
  const lookup = async (host: string) => (host === "canvas.calpoly.edu" ? ["52.10.1.2"] : host === "evil.example" ? ["10.0.0.5"] : ["127.0.0.1"]);
  assert.equal(await assertSafeBaseUrl("https://canvas.calpoly.edu/", lookup), "https://canvas.calpoly.edu");
  assert.equal(await assertSafeBaseUrl("canvas.calpoly.edu", lookup), "https://canvas.calpoly.edu");
  for (const bad of ["http://canvas.calpoly.edu", "https://127.0.0.1", "https://[::1]", "https://localhost", "https://evil.example", "https://user:pw@canvas.calpoly.edu", "https://canvas.calpoly.edu:8443"]) {
    await assert.rejects(assertSafeBaseUrl(bad, lookup), Error, bad);
  }
});

test("planner items become a due-soon list (assignments and quizzes with an assignment)", () => {
  const items = mapPlanner([
    { plannable_type: "assignment", course_id: 11, context_name: "MATH 141", plannable_id: 5, plannable: { title: "HW 3", due_at: "2026-10-07T06:59:00Z" }, html_url: "/courses/11/assignments/5", submissions: { submitted: false } },
    { plannable_type: "quiz", course_id: 12, context_name: "CHEM 124", plannable_id: 9, plannable: { title: "Quiz 2", due_at: "2026-10-06T06:59:00Z", assignment_id: 77 }, html_url: "/courses/12/quizzes/9", submissions: { submitted: false } },
    { plannable_type: "announcement", course_id: 11, context_name: "MATH 141", plannable_id: 1, plannable: { title: "Welcome" } },
    { plannable_type: "assignment", course_id: 11, context_name: "MATH 141", plannable_id: 6, plannable: { title: "Done already", due_at: "2026-10-06T06:59:00Z" }, submissions: { submitted: true } },
  ], "https://canvas.calpoly.edu");
  assert.deepEqual(items.map((i) => [i.name, i.courseId, i.assignmentId]), [["Quiz 2", 12, 77], ["HW 3", 11, 5]]);
  assert.equal(items[1].url, "https://canvas.calpoly.edu/courses/11/assignments/5");
  assert.equal(items[0].courseName, "CHEM 124");
});

test("assignment HTML turns into readable problem text", () => {
  const t = htmlToText('<p>Solve:</p><ol><li>2x + 3 = 9</li><li>x&sup2; = 16 &amp; x &gt; 0</li></ol><script>alert(1)</script><br>Show work.');
  assert.match(t, /Solve:/);
  assert.match(t, /1\. 2x \+ 3 = 9/);
  assert.match(t, /2\. x² = 16 & x > 0/);
  assert.ok(!/alert/.test(t));
  assert.match(t, /Show work\./);
});
