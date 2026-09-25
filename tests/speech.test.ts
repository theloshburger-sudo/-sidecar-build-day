import { test } from "node:test";
import assert from "node:assert/strict";
import { speakable } from "../lib/speech";

test("speakable turns board math into words", () => {
  assert.equal(speakable("3x + 7 = 22"), "3x + 7 equals 22");
  assert.equal(speakable("22 − 7"), "22 minus 7");
  assert.equal(speakable("x² ÷ 2"), "x squared divided by 2");
});

test("isEcho ignores Teacher's own voice but not the student's", async () => {
  const { isEcho } = await import("../lib/speech");
  const line = "First I'll circle the 3x, because it was the last thing done to x.";
  assert.equal(isEcho("circle the 3x because", line), true);
  assert.equal(isEcho("wait why do we subtract first", line), false);
  assert.equal(isEcho("hold on", ""), false);
});

test("exponents are spoken as powers", () => {
  assert.match(speakable("Simplify i¹⁴²"), /i to the power of 142/);
  assert.match(speakable("x^2 + 1"), /x squared/);
});

test("a browser voice that errors at once still starts and ends each line exactly once", async () => {
  const { speak } = await import("../lib/speech");
  const g = globalThis as Record<string, unknown>;
  // Headless / voiceless browsers: every utterance fails immediately, with no onstart.
  g.SpeechSynthesisUtterance = class {
    text: string;
    voice: unknown = null;
    rate = 1;
    pitch = 1;
    onstart: (() => void) | null = null;
    onend: (() => void) | null = null;
    onerror: (() => void) | null = null;
    constructor(t: string) {
      this.text = t;
    }
  };
  g.window = { speechSynthesis: { getVoices: () => [], cancel() {}, speak: (u: { onerror: (() => void) | null }) => setTimeout(() => u.onerror?.(), 5) } };
  try {
    const events: string[] = [];
    await new Promise<void>((resolve) => {
      speak("Hi there. Two sentences.", { onStart: () => events.push("start"), onEnd: () => (events.push("end"), setTimeout(resolve, 1200)) });
    });
    // A start after the end is what made Sidecar draw the beat a second time.
    assert.deepEqual(events, ["start", "end"]);
  } finally {
    delete g.window;
    delete g.SpeechSynthesisUtterance;
  }
});

test("a device voice that can't speak is skipped: the line is said again with the next voice", async () => {
  const { speak, browserVoices } = await import("../lib/speech");
  const g = globalThis as Record<string, unknown>;
  const spokenWith: string[] = [];
  g.SpeechSynthesisUtterance = class {
    text: string;
    voice: { name: string } | null = null;
    rate = 1;
    pitch = 1;
    onstart: (() => void) | null = null;
    onend: (() => void) | null = null;
    onerror: ((e: { error: string }) => void) | null = null;
    constructor(t: string) {
      this.text = t;
    }
  };
  const voices = [
    { name: "Bahh", lang: "en-US" },
    { name: "Eddy (English (United States))", lang: "en-US" },
    { name: "Samantha", lang: "en-US" },
    { name: "Google US English", lang: "en-US" },
  ];
  let queue: InstanceType<typeof g.SpeechSynthesisUtterance & (new (t: string) => { voice: { name: string } | null; onstart: (() => void) | null; onend: (() => void) | null; onerror: ((e: { error: string }) => void) | null })>[] = [];
  g.window = {
    speechSynthesis: {
      getVoices: () => voices,
      cancel() {
        const q = queue;
        queue = [];
        q.forEach((u) => setTimeout(() => u.onerror?.({ error: "canceled" }), 0));
      },
      // The top-ranked voice fails; every other voice works.
      speak(u: (typeof queue)[number]) {
        queue.push(u);
        const name = u.voice?.name ?? "";
        setTimeout(() => {
          if (name === "Samantha") return u.onerror?.({ error: "synthesis-failed" });
          spokenWith.push(name);
          u.onstart?.();
          setTimeout(() => u.onend?.(), 5);
        }, 5);
      },
    },
  };
  try {
    const list = browserVoices();
    assert.ok(!list.includes("Bahh") && !list.some((n) => n.startsWith("Eddy")), `joke/robot voices hidden: ${list}`);
    const events: string[] = [];
    await new Promise<void>((resolve) => speak("Hello there.", { onStart: () => events.push("start"), onEnd: () => (events.push("end"), resolve()) }));
    assert.deepEqual(events, ["start", "end"]);
    assert.deepEqual(spokenWith, ["Google US English"], "said once, with the next voice after Samantha failed");
  } finally {
    delete g.window;
    delete g.SpeechSynthesisUtterance;
  }
});

test("natural-voice clips are fetched at most 2 at a time, and a failed clip is tried again later", async () => {
  const { prefetchVoice, setVoiceChoice } = await import("../lib/speech");
  const g = globalThis as Record<string, unknown>;
  const realFetch = g.fetch;
  let inFlight = 0;
  let peak = 0;
  let calls = 0;
  g.fetch = async () => {
    const n = ++calls;
    inFlight++;
    peak = Math.max(peak, inFlight);
    await new Promise((r) => setTimeout(r, 20));
    inFlight--;
    return { ok: n !== 1, blob: async () => ({}) }; // the very first clip fails
  };
  try {
    setVoiceChoice("george");
    const lines = ["One line.", "Two line.", "Three line.", "Four line.", "Five line."];
    lines.forEach((l) => prefetchVoice(l));
    await new Promise((r) => setTimeout(r, 200));
    assert.equal(calls, 5);
    assert.ok(peak <= 2, `peak concurrency ${peak}`);
    prefetchVoice("One line."); // failed before: not cached, so it's fetched again
    prefetchVoice("Two line."); // succeeded: served from cache
    await new Promise((r) => setTimeout(r, 60));
    assert.equal(calls, 6);
  } finally {
    g.fetch = realFetch;
    setVoiceChoice("");
  }
});
