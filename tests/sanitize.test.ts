import { test } from "node:test";
import assert from "node:assert/strict";
import { normalizeTurn, splitProblems } from "../lib/sanitize";
import { firstMessage } from "../lib/prompt";

test("normalizeTurn fills defaults from junk", () => {
  const t = normalizeTurn({ phase: "weird", board: [null, { type: "write", text: "hi" }], choices: [1, "a"] });
  assert.equal(t.phase, "teach");
  assert.equal(t.board.length, 1);
  assert.deepEqual(t.choices, ["a"]);
  assert.equal(t.verdict, "none");
});

test("splitProblems splits numbered worksheets", () => {
  const ps = splitProblems("Unit 3 Worksheet\nName: ____\n1. Solve 2x = 4\n2. Solve x + 3 = 9\nQuestion 3: graph y = x");
  assert.equal(ps.length, 3);
  assert.match(ps[0].text, /2x = 4/);
});

test("splitProblems keeps a single problem whole", () => {
  const ps = splitProblems("What is the derivative of x squared times sin x?");
  assert.equal(ps.length, 1);
});

test("concept: slug is kebab-cased and dropped when empty; warmup is a real phase", () => {
  const t = normalizeTurn({ phase: "warmup", concept: { slug: "Interval Endpoints!!", label: "Open vs closed endpoints" } });
  assert.equal(t.phase, "warmup");
  assert.deepEqual(t.concept, { slug: "interval-endpoints", label: "Open vs closed endpoints" });
  assert.deepEqual(normalizeTurn({ concept: { slug: "  ", label: "x" } }).concept, { slug: "", label: "" });
  assert.deepEqual(normalizeTurn({}).concept, { slug: "", label: "" });
});

test("first message lists known concepts and the one warm-up, only when given", () => {
  const p = { id: "p1", title: "t", text: "Solve 2x+5=17", subject: "Algebra" };
  const prefs = { format: "visual", voice: false, focus: false, pace: "normal", speed: 1, voiceSpeed: 1 } as const;
  const plain = firstMessage(p, prefs);
  assert.ok(!/concept/i.test(plain) && !/warm-up/i.test(plain));
  const m = firstMessage(p, prefs, [], [{ slug: "inverse-operations", label: "Inverse operations" }], { slug: "interval-endpoints", label: "Open vs closed endpoints" });
  assert.match(m, /inverse-operations: Inverse operations/);
  assert.match(m, /warm-up.*interval-endpoints/is);
});

test("screen: the shared-screen frame is attached as its own labeled image, alongside board ink", async () => {
  const { toMessages } = await import("../lib/prompt");
  const p = { id: "screen", title: "My screen", text: "Help with what's on my screen", subject: "" };
  const prefs = { format: "visual", voice: false, focus: false, pace: "normal", speed: 1, voiceSpeed: 1 } as const;
  const png = "data:image/jpeg;base64,AAAA";
  const msgs = toMessages(p, prefs, [], "(empty)", "what does this button do?", png, [], [], undefined, png);
  const last = msgs.at(-1)!.content as { type: string; text?: string }[];
  assert.equal(last.filter((c) => c.type === "image").length, 2);
  assert.match(last.at(-1)!.text!, /shared screen/i);
  const onlyScreen = toMessages(p, prefs, [], "", "hi", undefined, [], [], undefined, png).at(-1)!.content as { type: string; text?: string }[];
  assert.equal(onlyScreen.filter((c) => c.type === "image").length, 1);
  assert.doesNotMatch(onlyScreen.at(-1)!.text!, /GREEN ink/);
});

test("screenMark coordinates are clamped to the 0–1000 grid", async () => {
  const { normalizeScreenMark } = await import("../lib/sanitize");
  assert.deepEqual(normalizeScreenMark({ type: "screenMark", kind: "circle", x: 1500, y: -20, x2: 0, y2: 0, text: "this", color: "red" }), { type: "screenMark", kind: "circle", x: 1000, y: 0, x2: 0, y2: 0, text: "this", color: "red" });
  assert.equal(normalizeScreenMark({ type: "screenMark", kind: "laser", x: 1, y: 1 }).kind, "circle");
});
