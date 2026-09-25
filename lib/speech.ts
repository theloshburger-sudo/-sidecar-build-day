// Browser speech as progressive enhancement. Everything works without it.

import { segments } from "./mathtext";

type SR = {
  lang: string;
  interimResults: boolean;
  continuous: boolean;
  start(): void;
  stop(): void;
  abort(): void;
  onresult: ((e: { resultIndex: number; results: ArrayLike<ArrayLike<{ transcript: string }> & { isFinal: boolean }> }) => void) | null;
  onend: (() => void) | null;
  onerror: ((e: { error: string }) => void) | null;
};

export function speechRecognitionSupported(): boolean {
  if (typeof window === "undefined") return false;
  const w = window as unknown as Record<string, unknown>;
  return Boolean(w.SpeechRecognition || w.webkitSpeechRecognition);
}

export function ttsSupported(): boolean {
  return typeof window !== "undefined" && "speechSynthesis" in window;
}

export function createRecognizer(
  handlers: {
    onText: (text: string, final: boolean) => void;
    onEnd: () => void;
    onError: (msg: string, code: string) => void;
  },
  opts: { continuous?: boolean } = {},
): SR | null {
  if (!speechRecognitionSupported()) return null;
  const w = window as unknown as { SpeechRecognition?: new () => SR; webkitSpeechRecognition?: new () => SR };
  const Ctor = w.SpeechRecognition ?? w.webkitSpeechRecognition!;
  const rec = new Ctor();
  rec.lang = "en-US";
  rec.interimResults = true;
  rec.continuous = Boolean(opts.continuous);
  rec.onresult = (e) => {
    if (opts.continuous) {
      // Hands-free: report each finished phrase once, plus the phrase in progress.
      let interim = "";
      for (let i = e.resultIndex; i < e.results.length; i++) {
        const r = e.results[i];
        if (r.isFinal) handlers.onText(r[0].transcript, true);
        else interim += r[0].transcript;
      }
      if (interim) handlers.onText(interim, false);
      return;
    }
    let text = "";
    let final = false;
    for (let i = 0; i < e.results.length; i++) {
      text += e.results[i][0].transcript;
      if (e.results[i].isFinal) final = true;
    }
    handlers.onText(text, final);
  };
  rec.onend = handlers.onEnd;
  rec.onerror = (e) => {
    const msg =
      e.error === "not-allowed" || e.error === "service-not-allowed"
        ? "Microphone access was blocked. Allow it in your browser's address bar, or just type."
        : e.error === "audio-capture"
          ? "No microphone was found. Plug one in or check your sound settings, or just type."
          : e.error === "no-speech"
          ? "I didn't catch that. Try again, or type your question."
          : "Voice input stopped. You can always type instead.";
    handlers.onError(msg, e.error);
  };
  return rec;
}

const words = (t: string) => t.toLowerCase().replace(/[^a-z0-9\s]/g, " ").split(/\s+/).filter(Boolean);

/**
 * True when what the mic heard is probably Teacher's own voice coming out of the speakers
 * (most of its words appear in what Teacher is currently saying).
 */
export function isEcho(heard: string, speaking: string): boolean {
  const h = words(heard);
  if (!h.length) return true;
  const said = new Set(words(speaking));
  if (!said.size) return false;
  const overlap = h.filter((w) => said.has(w)).length / h.length;
  return overlap >= 0.6;
}

let preferred: SpeechSynthesisVoice | null = null;
/** Browser voices that failed to speak on this device; skipped from then on. */
const broken = new Set<string>();
/** The student's voice pick: a natural voice id (e.g. "george") or "browser:<voice name>". */
let choice = "";

export function setVoiceChoice(v: string) {
  if (v === choice) return;
  choice = v;
  preferred = null;
}

/** English browser voices, most natural first (for the voice picker when no natural voice is set up). */
export function browserVoices(): string[] {
  if (typeof window === "undefined" || !("speechSynthesis" in window)) return [];
  const voices = window.speechSynthesis.getVoices().filter((v) => v.lang?.toLowerCase().startsWith("en"));
  return [...voices].sort((a, b) => voiceScore(b) - voiceScore(a)).filter((v) => voiceScore(v) > -50 && !broken.has(v.name)).slice(0, 6).map((v) => v.name);
}

function voiceScore(v: SpeechSynthesisVoice) {
  const n = v.name.toLowerCase();
  let s = 0;
  if (/natural|neural|online/.test(n)) s += 50; // Edge / Windows neural voices
  if (/premium|enhanced/.test(n)) s += 40; // macOS / iOS downloaded voices
  if (/google/.test(n)) s += 25;
  if (/ava|aria|jenny|emma|samantha|allison|zoe|serena/.test(n)) s += 10;
  if (/en-us/i.test(v.lang)) s += 5;
  if (/compact|espeak|fred|albert|zarvox|whisper|bad news|bells|boing|bubbles|cellos|jester|organ|trinoids|wobble/.test(n)) s -= 100;
  // macOS joke voices and the robotic "Eloquence" set: fine for a laugh, wrong for a tutor.
  if (/\b(bahh|good news|superstar|junior|ralph|kathy|eddy|flo|grandma|grandpa|reed|rocko|sandy|shelley)\b/.test(n)) s -= 100;
  // Voices that sound natural on each platform.
  if (/samantha|alex|daniel|karen|moira|tessa|google us english|google uk english/.test(n)) s += 20;
  return s;
}

/** Pick the most natural-sounding voice the browser has (neural "Natural"/"Online"/"Premium" voices first). */
function pickVoice(): SpeechSynthesisVoice | null {
  if (preferred) return preferred;
  const voices = window.speechSynthesis.getVoices().filter((v) => v.lang?.toLowerCase().startsWith("en"));
  if (!voices.length) return null;
  const picked = choice.startsWith("browser:") ? voices.find((v) => v.name === choice.slice(8) && !broken.has(v.name)) : undefined;
  if (picked) return (preferred = picked);
  preferred = [...voices].filter((v) => !broken.has(v.name)).sort((a, b) => voiceScore(b) - voiceScore(a))[0] ?? null;
  return preferred;
}

if (typeof window !== "undefined" && "speechSynthesis" in window) {
  window.speechSynthesis.onvoiceschanged = () => {
    preferred = null;
  };
}

/** Turn board-style math into words a voice reads naturally. */
export function speakable(text: string): string {
  // Exponents: x² → "x squared", i¹⁴² → "i to the power of 142".
  const withPowers = segments(text)
    .map((sg) => (sg.k === "sup" ? (sg.t === "2" ? " squared" : sg.t === "3" ? " cubed" : ` to the power of ${sg.t}`) : sg.t))
    .join("");
  return withPowers
    .replace(/[_*#`]/g, "")
    .replace(/\s*=\s*/g, " equals ")
    .replace(/(\d)\s*[−-]\s*(\d)/g, "$1 minus $2")
    .replace(/[−]/g, " minus ")
    .replace(/×/g, " times ")
    .replace(/÷/g, " divided by ")
    .replace(/²/g, " squared")
    .replace(/³/g, " cubed")
    .replace(/√/g, " square root of ")
    .replace(/≤/g, " less than or equal to ")
    .replace(/≥/g, " greater than or equal to ")
    .replace(/∞/g, " infinity")
    .replace(/∩/g, " intersect ")
    .replace(/∪/g, " union ")
    .replace(/\s{2,}/g, " ")
    .trim();
}

// ---- playback state (one voice at a time) ----
let audio: HTMLAudioElement | null = null;

// Safari only lets an <audio> element play from a click; our clips arrive a moment after the click.
// So Teacher reuses ONE element, unlocked on the student's first tap/keypress with a tiny silent clip.
let player: HTMLAudioElement | null = null;
let unlocked = false;
function getPlayer(): HTMLAudioElement | null {
  if (!player && typeof Audio !== "undefined") player = new Audio();
  return player;
}
function silentWav(): string {
  const b = new ArrayBuffer(46);
  const v = new DataView(b);
  const str = (o: number, t: string) => [...t].forEach((c, i) => v.setUint8(o + i, c.charCodeAt(0)));
  str(0, "RIFF"); v.setUint32(4, 38, true); str(8, "WAVE"); str(12, "fmt ");
  v.setUint32(16, 16, true); v.setUint16(20, 1, true); v.setUint16(22, 1, true);
  v.setUint32(24, 8000, true); v.setUint32(28, 16000, true); v.setUint16(32, 2, true); v.setUint16(34, 16, true);
  str(36, "data"); v.setUint32(40, 2, true); v.setInt16(44, 0, true);
  return URL.createObjectURL(new Blob([b], { type: "audio/wav" }));
}
/** Call from a user gesture (tap, click, key). Safe to call often. */
export function unlockAudio() {
  const p = getPlayer();
  if (!p || unlocked || (audio && !audio.paused)) return; // never interrupt a clip that's playing
  try {
    p.src = silentWav();
    void p.play().then(() => (unlocked = true)).catch(() => {});
  } catch {}
}
if (typeof window !== "undefined") {
  const onGesture = () => {
    unlockAudio();
    if (unlocked) {
      window.removeEventListener("pointerdown", onGesture, true);
      window.removeEventListener("keydown", onGesture, true);
    }
  };
  window.addEventListener("pointerdown", onGesture, true);
  window.addEventListener("keydown", onGesture, true);
}
let token = 0;
const waiting = new Set<() => void>();
const ttsCache = new Map<string, Promise<Blob | null>>();

export interface SpeakOptions {
  /** Voice speed, kept in a comfortable 0.75–1.5 range. */
  rate?: number;
  /** Use the natural server voice (/api/tts) when available. */
  natural?: boolean;
  /** Called when sound actually starts, with the expected spoken duration in ms. */
  onStart?: (durationMs: number) => void;
  onEnd?: () => void;
}

const estimateMs = (text: string, rate: number) => (text.split(/\s+/).filter(Boolean).length / 2.6 / rate) * 1000 + 300;

let voiceProblemHandler: ((msg: string) => void) | null = null;
let voiceProblemShown = false;
/** Called (once per page load) with the reason natural-voice clips are failing. */
export function onVoiceProblem(fn: ((msg: string) => void) | null) {
  voiceProblemHandler = fn;
}
/**
 * Account-level trouble (out of credits, key rejected, free tier blocked): every clip would fail
 * the same way, so stop asking for the rest of the visit and use the device voice.
 */
let naturalDown = false;
const naturalListeners = new Set<(ok: boolean) => void>();
export function naturalVoiceWorking(): boolean {
  return !naturalDown;
}
export function onNaturalVoiceChange(fn: (ok: boolean) => void): () => void {
  naturalListeners.add(fn);
  return () => naturalListeners.delete(fn);
}
function markNaturalDown() {
  if (naturalDown) return;
  naturalDown = true;
  naturalListeners.forEach((fn) => fn(false));
}
function reportVoiceProblem(msg: string) {
  if (voiceProblemShown || !voiceProblemHandler) return;
  voiceProblemShown = true;
  voiceProblemHandler(msg);
}

// ElevenLabs refuses requests beyond a plan's concurrency limit (2 on the free tier) with a 429,
// and each refused line fell back to the device voice. Keep at most 2 in flight, in order.
const TTS_MAX_IN_FLIGHT = 2;
let ttsInFlight = 0;
const ttsWaiting: (() => void)[] = [];
function ttsSlot(urgent = false): Promise<() => void> {
  return new Promise((resolve) => {
    const take = () => {
      ttsInFlight++;
      let freed = false;
      resolve(() => {
        if (freed) return;
        freed = true;
        ttsInFlight--;
        ttsWaiting.shift()?.();
      });
    };
    if (ttsInFlight < TTS_MAX_IN_FLIGHT) take();
    else if (urgent) ttsWaiting.unshift(take);
    else ttsWaiting.push(take);
  });
}

/** Fetch (and cache) natural-voice audio, so the next beat is ready before the current one ends. */
function fetchTTS(text: string, urgent = false, voiceId?: string): Promise<Blob | null> {
  const clean = speakable(text);
  if (!clean || naturalDown) return Promise.resolve(null);
  const voice = voiceId ?? (choice.startsWith("browser:") ? "" : choice);
  const cacheKey = `${voice}|${clean}`;
  const hit = ttsCache.get(cacheKey);
  if (hit) return hit;
  const p = ttsSlot(urgent).then((release) => {
    // The clock starts when the request does, not while it waits its turn.
    const ctrl = new AbortController();
    const giveUp = setTimeout(() => ctrl.abort(), 9000);
    return fetch("/api/tts", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ text: clean, voice }), signal: ctrl.signal })
      .then(async (r) => {
        if (r.ok) return r.blob();
        // Tell the page once why the natural voice isn't working (it falls back to the device voice).
        const j = (await r.json().catch(() => ({}))) as { status?: number; detail?: string; error?: string };
        if ((j.status && [401, 402, 403].includes(j.status)) || /quota|credits|unusual activity|free tier|invalid api key/i.test(j.detail ?? "")) markNaturalDown();
        reportVoiceProblem(`${j.status ? `ElevenLabs ${j.status}` : `Voice server ${r.status}`}${j.detail ? `: ${j.detail}` : j.error ? `: ${j.error}` : ""}`);
        return null;
      })
      .catch(() => null)
      .finally(() => {
        clearTimeout(giveUp);
        release();
      });
  });
  ttsCache.set(cacheKey, p);
  // A failed clip isn't remembered: the next time this line comes up, try again.
  void p.then((b) => {
    if (!b && ttsCache.get(cacheKey) === p) ttsCache.delete(cacheKey);
  });
  if (ttsCache.size > 60) ttsCache.delete(ttsCache.keys().next().value!);
  return p;
}

/** Fetch a line in several natural voices ahead of time (e.g. voice previews when the picker opens). */
export function warmVoices(text: string, voiceIds: string[]) {
  for (const v of voiceIds) void fetchTTS(text, false, v);
}

export function prefetchVoice(text: string) {
  if (!choice.startsWith("browser:")) void fetchTTS(text);
}

/**
 * Speak with the most human voice available: ElevenLabs via /api/tts, falling back
 * to the best browser voice (sentence by sentence, which also avoids Chrome's
 * long-utterance cutoff). onStart reports how long the speech will take.
 */
export function speak(text: string, opts: SpeakOptions = {}) {
  stopSpeaking();
  const my = ++token;
  const clean = speakable(text);
  const rate = Math.min(1.5, Math.max(0.75, opts.rate ?? 1));
  if (!clean) {
    opts.onStart?.(0);
    opts.onEnd?.();
    return;
  }

  let retried = false;
  let gen = 0; // each attempt (first voice, retry voice) ignores callbacks from the other
  const browserVoice = () => {
    if (my !== token) return;
    const g = ++gen;
    if (!ttsSupported()) {
      opts.onStart?.(estimateMs(clean, rate));
      setTimeout(() => my === token && opts.onEnd?.(), estimateMs(clean, rate));
      return;
    }
    const synth = window.speechSynthesis;
    const parts = clean.match(/[^.!?]+[.!?]*/g)?.map((p) => p.trim()).filter(Boolean) ?? [clean];
    const v = pickVoice();
    let started = false;
    let ended = false;
    const finish = () => {
      if (ended || my !== token) return;
      ended = true;
      opts.onEnd?.();
    };
    // No audible speech (no voices, muted tab, speech error): keep the lesson's rhythm with the
    // estimated duration. Runs at most once, and never after the line already started or ended.
    const silent = () => {
      if (started || ended || my !== token || g !== gen) return;
      started = true;
      opts.onStart?.(estimateMs(clean, rate));
      setTimeout(finish, estimateMs(clean, rate));
    };
    parts.forEach((part, i) => {
      const u = new SpeechSynthesisUtterance(part);
      if (v) u.voice = v;
      u.rate = rate;
      u.pitch = 1.02;
      if (i === 0)
        u.onstart = () => {
          if (my !== token || started || g !== gen) return;
          started = true;
          opts.onStart?.(estimateMs(clean, rate));
        };
      // An error (or an end without a start) before any sound means nothing was heard:
      // skip that voice for good and say the line again with the next-best one.
      u.onerror = (e?: { error?: string }) => {
        if (g !== gen) return;
        if (started) return void (i === parts.length - 1 && finish());
        const err = e?.error ?? "";
        if (v && !retried && my === token && err !== "interrupted" && err !== "canceled") {
          retried = true;
          broken.add(v.name);
          preferred = null;
          gen++; // retire this attempt before cancel() fires its own errors
          synth.cancel();
          return browserVoice();
        }
        silent();
      };
      if (i === parts.length - 1) u.onend = () => g === gen && (started ? finish() : silent());
      synth.speak(u);
    });
    // Some browsers never fire events (muted tab, no voices): don't hold the lesson hostage.
    setTimeout(silent, 900);
  };

  if (!opts.natural || choice.startsWith("browser:")) return browserVoice();

  // The line being said now goes ahead of prefetches for later lines.
  fetchTTS(text, true).then((blob) => {
    if (my !== token) return;
    if (!blob) return browserVoice();
    const url = URL.createObjectURL(blob);
    const el = getPlayer() ?? new Audio();
    el.onplaying = el.onended = el.onerror = null;
    el.src = url;
    audio = el;
    el.playbackRate = rate;
    (el as HTMLAudioElement & { preservesPitch?: boolean }).preservesPitch = true;
    let started = false;
    el.onplaying = () => {
      if (started || my !== token) return;
      started = true;
      const secs = Number.isFinite(el.duration) && el.duration > 0 ? el.duration : estimateMs(clean, 1) / 1000;
      opts.onStart?.((secs * 1000) / rate);
    };
    el.onended = () => {
      URL.revokeObjectURL(url);
      if (my === token) opts.onEnd?.();
    };
    // Both can fire for one failure (decode error + rejected play): fall back only once.
    let fellBack = false;
    const fallBack = () => {
      if (fellBack || started) return;
      fellBack = true;
      browserVoice();
    };
    el.onerror = fallBack;
    el.play().catch(fallBack); // autoplay blocked or decode error
  });
}

/** Promise form of speak(): resolves when the line finishes, or immediately if speech is stopped. */
export function speakAsync(text: string, opts: Omit<SpeakOptions, "onEnd"> = {}): Promise<void> {
  return new Promise((resolve) => {
    let done = false;
    const finish = () => {
      if (done) return;
      done = true;
      waiting.delete(finish);
      resolve();
    };
    speak(text, { ...opts, onEnd: finish });
    waiting.add(finish);
  });
}

export function stopSpeaking() {
  token++;
  if (audio) {
    audio.pause();
    audio = null;
  }
  if (ttsSupported()) window.speechSynthesis.cancel();
  for (const w of [...waiting]) w();
}
