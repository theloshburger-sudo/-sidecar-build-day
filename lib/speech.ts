// Browser speech as progressive enhancement. Everything works without it.

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

/** Pick the most natural-sounding voice the browser has (neural "Natural"/"Online"/"Premium" voices first). */
function pickVoice(): SpeechSynthesisVoice | null {
  if (preferred) return preferred;
  const voices = window.speechSynthesis.getVoices().filter((v) => v.lang?.toLowerCase().startsWith("en"));
  if (!voices.length) return null;
  const score = (v: SpeechSynthesisVoice) => {
    const n = v.name.toLowerCase();
    let s = 0;
    if (/natural|neural|online/.test(n)) s += 50; // Edge / Windows neural voices
    if (/premium|enhanced/.test(n)) s += 40; // macOS / iOS downloaded voices
    if (/google/.test(n)) s += 25;
    if (/ava|aria|jenny|emma|samantha|allison|zoe|serena/.test(n)) s += 10;
    if (/en-us/i.test(v.lang)) s += 5;
    if (/compact|espeak|fred|albert|zarvox|whisper|bad news|bells|boing|bubbles|cellos|jester|organ|trinoids|wobble/.test(n)) s -= 100;
    return s;
  };
  preferred = [...voices].sort((a, b) => score(b) - score(a))[0] ?? null;
  return preferred;
}

if (typeof window !== "undefined" && "speechSynthesis" in window) {
  window.speechSynthesis.onvoiceschanged = () => {
    preferred = null;
  };
}

/** Turn board-style math into words a voice reads naturally. */
export function speakable(text: string): string {
  return text
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

/** Fetch (and cache) natural-voice audio, so the next beat is ready before the current one ends. */
function fetchTTS(text: string): Promise<Blob | null> {
  const clean = speakable(text);
  if (!clean) return Promise.resolve(null);
  const hit = ttsCache.get(clean);
  if (hit) return hit;
  const ctrl = new AbortController();
  const giveUp = setTimeout(() => ctrl.abort(), 6000);
  const p = fetch("/api/tts", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ text: clean }), signal: ctrl.signal })
    .then((r) => (r.ok ? r.blob() : null))
    .catch(() => null)
    .finally(() => clearTimeout(giveUp));
  ttsCache.set(clean, p);
  if (ttsCache.size > 60) ttsCache.delete(ttsCache.keys().next().value!);
  return p;
}

export function prefetchVoice(text: string) {
  void fetchTTS(text);
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

  const browserVoice = () => {
    if (my !== token) return;
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
    parts.forEach((part, i) => {
      const u = new SpeechSynthesisUtterance(part);
      if (v) u.voice = v;
      u.rate = rate;
      u.pitch = 1.02;
      if (i === 0)
        u.onstart = () => {
          if (my !== token || started) return;
          started = true;
          opts.onStart?.(estimateMs(clean, rate));
        };
      if (i === parts.length - 1) {
        u.onend = finish;
        u.onerror = finish;
      }
      synth.speak(u);
    });
    // Some browsers never fire events (muted tab, no voices): don't hold the lesson hostage.
    setTimeout(() => {
      if (my === token && !started) {
        started = true;
        opts.onStart?.(estimateMs(clean, rate));
        setTimeout(finish, estimateMs(clean, rate));
      }
    }, 900);
  };

  if (!opts.natural) return browserVoice();

  fetchTTS(text).then((blob) => {
    if (my !== token) return;
    if (!blob) return browserVoice();
    const url = URL.createObjectURL(blob);
    const el = new Audio(url);
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
    el.onerror = () => browserVoice();
    el.play().catch(() => browserVoice()); // autoplay blocked or decode error
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
