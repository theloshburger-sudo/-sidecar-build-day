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
  const msgs = toMessages(p, prefs, [], "(empty)", "what does this button do?", png, [], [], undefined, png, { w: 1456, h: 819 });
  const last = msgs.at(-1)!.content as { type: string; text?: string }[];
  assert.equal(last.filter((c) => c.type === "image").length, 2);
  assert.match(last.at(-1)!.text!, /shared screen/i);
  assert.match(last.at(-1)!.text!, /1456×819 pixels/);
  const onlyScreen = toMessages(p, prefs, [], "", "hi", undefined, [], [], undefined, png).at(-1)!.content as { type: string; text?: string }[];
  assert.equal(onlyScreen.filter((c) => c.type === "image").length, 1);
  assert.doesNotMatch(onlyScreen.at(-1)!.text!, /GREEN ink/);
});

test("screenMark pixel coordinates are rounded and kept in range", async () => {
  const { normalizeScreenMark } = await import("../lib/sanitize");
  assert.deepEqual(normalizeScreenMark({ type: "screenMark", kind: "box", x: 412.6, y: -20, x2: 9000, y2: 300, text: "this", color: "red" }), { type: "screenMark", kind: "box", x: 413, y: 0, x2: 4000, y2: 300, text: "this", color: "red" });
  assert.equal(normalizeScreenMark({ type: "screenMark", kind: "laser", x: 1, y: 1 }).kind, "circle");
});

test("screen zooms ride along after the full screenshot, with their position, and marks stay in full-screenshot pixels", async () => {
  const { toMessages } = await import("../lib/prompt");
  const p = { id: "screen", title: "My screen", text: "Help with what's on my screen", subject: "" };
  const prefs = { format: "visual", voice: false, focus: false, pace: "normal", speed: 1, voiceSpeed: 1 } as const;
  const jpg = "data:image/jpeg;base64,AAAA";
  const tiles = [{ url: jpg, x: 0, y: 0, w: 772, h: 434 }, { url: jpg, x: 684, y: 0, w: 772, h: 434 }];
  const content = toMessages(p, prefs, [], "", "what goes in the blank?", undefined, [], [], undefined, jpg, { w: 1456, h: 819 }, tiles).at(-1)!.content as { type: string; text?: string }[];
  assert.equal(content.filter((c) => c.type === "image").length, 3);
  const text = content.at(-1)!.text!;
  assert.match(text, /Image 1: the student's shared screen/);
  assert.match(text, /image 2 = x 0–772, y 0–434; image 3 = x 684–1456/);
  assert.match(text, /FULL screenshot's pixels/);
});

test("earlier views of the page come after the zooms, described, and marks stay on the current screen", async () => {
  const { toMessages } = await import("../lib/prompt");
  const p = { id: "screen", title: "My screen", text: "Help with what's on my screen", subject: "" };
  const prefs = { format: "visual", voice: false, focus: false, pace: "normal", speed: 1, voiceSpeed: 1 } as const;
  const jpg = "data:image/jpeg;base64,AAAA";
  const content = toMessages(p, prefs, [], "", "plot the points", undefined, [], [], undefined, jpg, { w: 1456, h: 819 }, [], [jpg, jpg]).at(-1)!.content as { type: string; text?: string }[];
  assert.equal(content.filter((c) => c.type === "image").length, 3);
  const text = content.at(-1)!.text!;
  assert.match(text, /Images 2–3 are earlier views/);
  assert.match(text, /Don't ask them to scroll back/);
  assert.match(text, /screenMarks only go on image 1/);
});
