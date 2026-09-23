"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Cloud, { type Mood } from "./Cloud";
import TopBar, { StatusPill } from "./TopBar";
import Whiteboard, { type WhiteboardHandle } from "./Whiteboard";
import VideoCards from "./VideoCards";
import MathText from "./MathText";
import { RECAPS_KEY, loadRecaps } from "./Home";
import type { AppStatus, Engine } from "./SidecarApp";
import { applyActions, badgeSpot, boardHeight, describeBoard, emptyBoard, primsBox, BOARD_MIN_H, type BoardState, type Measure } from "@/lib/board";
import { getDemo } from "@/lib/demo";
import { demoReply, demoStart, type DemoState } from "@/lib/demo-engine";
import { createRecognizer, isEcho, prefetchVoice, speakAsync, speechRecognitionSupported, stopSpeaking, ttsSupported } from "@/lib/speech";
import { BeatBuilder, beatsFromTurn, type Beat } from "@/lib/narration";
import { BoardStreamParser, STREAM_ERROR } from "@/lib/stream-parse";
import { normalizeTurn } from "@/lib/sanitize";
import { addInsight, forgetLearner, loadLearner } from "@/lib/profile";
import type { Assignment, BoardAction, ChatEntry, Phase, Preferences, Problem, TutorTurn, VideoSuggestion } from "@/lib/types";

const PHASES: { id: Phase; label: string }[] = [
  { id: "diagnose", label: "Find the gap" },
  { id: "teach", label: "Learn it" },
  { id: "check", label: "Check" },
  { id: "practice", label: "Try one solo" },
  { id: "wrapup", label: "Done" },
];

const DRAW_SPEEDS = [0, 0.25, 0.5, 1, 1.5, 2]; // 0 = Auto (paced to the voice)
const VOICE_SPEEDS = [0.75, 1, 1.25, 1.5];

const QUICK = ["Why?", "Show it differently", "Slow down", "Give me an example"];

function makeMeasure(): Measure {
  const ctx = document.createElement("canvas").getContext("2d");
  const fam = getComputedStyle(document.documentElement).getPropertyValue("--font-hand").trim() || "cursive";
  const cache = new Map<string, number>();
  return (text, size) => {
    if (!ctx) return text.length * size * 0.5;
    const k = `${size}|${text}`;
    const hit = cache.get(k);
    if (hit !== undefined) return hit;
    ctx.font = `${size}px ${fam}`;
    const w = ctx.measureText(text).width;
    if (cache.size > 4000) cache.clear();
    cache.set(k, w);
    return w;
  };
}

export default function Session({
  assignment,
  problem,
  initialEngine,
  status,
  prefs,
  setPrefs,
  onBack,
  onHome,
}: {
  assignment: Assignment;
  problem: Problem;
  initialEngine: Engine;
  status: AppStatus | null;
  prefs: Preferences;
  setPrefs: (p: Partial<Preferences>) => void;
  onBack: () => void;
  onHome: () => void;
}) {
  const demo = getDemo(assignment.demoId);
  const lesson = demo && demo.lesson.problemId === problem.id ? demo.lesson : null;

  const [engine, setEngine] = useState<Engine>(initialEngine);
  const [history, setHistory] = useState<ChatEntry[]>([]);
  const [thinking, setThinking] = useState(false);
  const [error, setError] = useState<{ message: string; retry: string | null } | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [boardBusy, setBoardBusy] = useState(false);
  const [speaking, setSpeaking] = useState(false);
  const [happy, setHappy] = useState(false);
  const [listening, setListening] = useState(false);
  const [input, setInput] = useState("");
  const [boardH, setBoardH] = useState(BOARD_MIN_H);
  const [plan, setPlan] = useState<string[]>([]);
  const [gap, setGap] = useState("");
  const [videos, setVideos] = useState<VideoSuggestion[]>([]);
  const [practice, setPractice] = useState("");
  const [practiceResult, setPracticeResult] = useState<string | null>(null);
  const [showProblem, setShowProblem] = useState(true);
  /** Spoken lines of the current turn, revealed as they're said, and which one is playing. */
  const [beatLines, setBeatLines] = useState<string[]>([]);
  const [activeBeat, setActiveBeat] = useState(-1);
  /** Glow + numbered badges that tie each spoken line to the strokes it draws. */
  const [focusBeat, setFocusBeat] = useState<number | null>(null);
  const [tags, setTags] = useState<{ n: number; x: number; y: number; uid: number }[]>([]);
  const beatUid = useRef(0);
  const [streaming, setStreaming] = useState(false);
  const [penMode, setPenMode] = useState(false);
  const [inkCount, setInkCount] = useState(0);
  const inkSent = useRef(0);
  /** What Teacher has learned about how this student learns (on-device). */
  const [learner, setLearner] = useState<string[]>([]);
  const [learnerNew, setLearnerNew] = useState(false);
  const [learnerOpen, setLearnerOpen] = useState(false);
  const learnerRef = useRef<string[]>([]);
  learnerRef.current = learner;
  useEffect(() => setLearner(loadLearner()), []);

  const wb = useRef<WhiteboardHandle>(null);
  const board = useRef<BoardState>(emptyBoard());
  const demoState = useRef<DemoState | null>(null);
  const historyRef = useRef<ChatEntry[]>([]);
  const measure = useRef<Measure | null>(null);
  const recognizer = useRef<ReturnType<typeof createRecognizer>>(null);
  const logRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const started = useRef(false);
  const prefsRef = useRef(prefs);
  prefsRef.current = prefs;
  const playToken = useRef(0);
  const [handsFree, setHandsFree] = useState(false);
  const handsFreeRef = useRef(false);
  const pendingVoice = useRef<string | null>(null);
  const speakingRef = useRef(false);
  const busyRef = useRef(false);
  const thinkingRef = useRef(false);
  const currentLineRef = useRef("");
  const sendRef = useRef<(t: string) => void>(() => {});
  const statusRef = useRef(status);
  /** The beat player for the turn currently being taught (see playTurn). */
  const player = useRef<{ push(a: BoardAction): void; end(turn: TutorTurn): void; flush(): void } | null>(null);
  statusRef.current = status;

  const lastTutor = useMemo(() => {
    for (let i = history.length - 1; i >= 0; i--) {
      const e = history[i];
      if (e.role === "tutor") return e.turn;
    }
    return null;
  }, [history]);
  const phase: Phase = lastTutor?.phase ?? "diagnose";
  const step = lastTutor?.step ?? 0;

  const pushHistory = (e: ChatEntry) => {
    historyRef.current = [...historyRef.current, e];
    setHistory(historyRef.current);
  };

  // ---------------------------------------------------------------- teaching a turn, beat by beat
  /** Draw one beat's actions; resolves when the drawing (and its spoken line) are both finished. */
  const playBeat = useCallback(async (beat: Beat, alive: () => boolean, n: number) => {
    const res = applyActions(board.current, beat.actions, measure.current ?? undefined);
    board.current = res.state;
    setBoardH(boardHeight(res.state));
    // Tag this beat's strokes so they glow while the line is spoken, and badge them with the line's number.
    const uid = ++beatUid.current;
    for (const p of res.prims) if (p.kind !== "clear") p.beat = uid;
    const clearAt = res.prims.findIndex((p) => p.kind === "clear");
    const drawn = clearAt >= 0 ? res.prims.slice(clearAt + 1) : res.prims;
    const bb = primsBox(drawn);
    setTags((t) => {
      const kept = clearAt >= 0 ? [] : t;
      if (!bb || !beat.text) return kept;
      const spot = badgeSpot(res.state, bb, kept);
      return [...kept, { n, uid, x: spot.x, y: spot.y }];
    });
    setFocusBeat(uid);
    const p = prefsRef.current;
    const auto = !p.speed;
    if (p.voice && beat.text) {
      let drawn = false;
      const speech = speakAsync(beat.text, {
        rate: p.voiceSpeed || 1,
        natural: Boolean(statusRef.current?.voice),
        onStart: (ms) => {
          if (!alive()) return;
          drawn = true;
          setSpeaking(true);
          wb.current?.enqueue(res.prims, auto ? ms * 0.9 : undefined);
        },
      });
      await speech;
      if (!drawn) wb.current?.enqueue(res.prims);
      setSpeaking(false);
      await wb.current?.whenIdle();
    } else {
      wb.current?.enqueue(res.prims);
      await wb.current?.whenIdle();
      // Give the reader a moment on beats that are mostly talk.
      if (beat.text && alive()) await new Promise((r) => setTimeout(r, Math.min(700, 120 + beat.text.split(" ").length * 25)));
    }
  }, []);

  /** Start a player that plays beats as they arrive (from a stream) or all at once (demo/replay). */
  const startPlayer = useCallback(() => {
    const id = ++playToken.current;
    const alive = () => id === playToken.current;
    const builder = new BeatBuilder();
    let beats: Beat[] = builder.beats;
    let closed = () => builder.closed;
    let ended = false;
    let next = 0;
    let sawNarrate = false;
    let wake: (() => void) | null = null;
    const notify = () => {
      const w = wake;
      wake = null;
      w?.();
    };
    const natural = () => prefsRef.current.voice && Boolean(statusRef.current?.voice);
    const syncLines = () => setBeatLines(beats.map((b) => b.text));

    setBeatLines([]);
    setActiveBeat(-1);
    setTags([]);
    setFocusBeat(null);
    (async () => {
      while (alive()) {
        if (next < closed()) {
          const i = next++;
          setActiveBeat(i);
          if (natural() && beats[i + 1]?.text) prefetchVoice(beats[i + 1].text);
          await playBeat(beats[i], alive, i + 1);
          continue;
        }
        if (ended) break;
        await new Promise<void>((r) => (wake = r));
      }
      if (alive()) {
        setActiveBeat(-1);
        setFocusBeat(null);
      }
    })();

    const handle = {
      push(a: BoardAction) {
        if (!alive()) return;
        if (a.type === "narrate") {
          sawNarrate = true;
          if (natural() && a.text) prefetchVoice(String(a.text));
        }
        builder.push(a);
        syncLines();
        notify();
      },
      end(turn: TutorTurn) {
        if (!alive()) return;
        if (!sawNarrate) {
          // The reply had no narrate steps: pair its sentences with slices of the drawing instead.
          beats = beatsFromTurn(turn);
          closed = () => beats.length;
          if (natural() && beats[0]?.text) prefetchVoice(beats[0].text);
        } else builder.end();
        ended = true;
        syncLines();
        notify();
      },
      flush() {
        // Interrupted: put the rest of this turn on the board instantly.
        if (!alive()) return;
        playToken.current++;
        const rest = beats.slice(next).flatMap((b) => b.actions);
        next = beats.length;
        if (rest.length) {
          const res = applyActions(board.current, rest, measure.current ?? undefined);
          board.current = res.state;
          setBoardH(boardHeight(res.state));
          wb.current?.enqueue(res.prims);
        }
        wb.current?.finishNow();
        setActiveBeat(-1);
        setFocusBeat(null);
        setBeatLines(beats.map((b) => b.text));
        notify();
      },
    };
    player.current = handle;
    return handle;
  }, [playBeat]);

  /** Record a finished turn: history, progress, celebration. */
  const finishTurn = useCallback((turn: TutorTurn) => {
    pushHistory({ role: "tutor", turn });
    if (turn.insight) {
      const next = addInsight(turn.insight);
      if (next) {
        setLearner(next);
        setLearnerNew(true);
        setNotice(`🧠 Teacher learned: ${turn.insight}`);
        setTimeout(() => setLearnerNew(false), 3200);
      }
    }
    if (turn.plan.length) setPlan(turn.plan);
    if (turn.gap) setGap(turn.gap);
    if (turn.videos.length) setVideos(turn.videos);
    if (turn.practice) setPractice(turn.practice);
    if (turn.verdict === "correct") {
      setHappy(true);
      setTimeout(() => setHappy(false), 2600);
    }
  }, []);

  /** Interrupt whatever Teacher is saying/drawing. */
  const interrupt = useCallback(() => {
    stopSpeaking();
    setSpeaking(false);
    player.current?.flush();
    wb.current?.finishNow();
  }, []);

  // ---------------------------------------------------------------- asking the tutor
  const runDemo = useCallback(
    (text: string | null) => {
      if (!lesson) return;
      setThinking(true);
      const delay = 400 + Math.random() * 300;
      setTimeout(() => {
        const r = text === null || !demoState.current ? demoStart(lesson) : demoReply(lesson, demoState.current, text);
        demoState.current = r.state;
        setThinking(false);
        const pl = startPlayer();
        finishTurn(r.turn);
        pl.end(r.turn);
      }, delay);
    },
    [lesson, startPlayer, finishTurn],
  );

  const askTutor = useCallback(
    async (text: string | null, useEngine: Engine, image?: string) => {
      setError(null);
      if (useEngine === "demo") return runDemo(text);
      setThinking(true);
      setStreaming(true);
      let pl: ReturnType<typeof startPlayer> | null = null;
      try {
        const prior = text === null ? historyRef.current : historyRef.current.slice(0, -1);
        const res = await fetch("/api/tutor", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            problem,
            preferences: prefsRef.current,
            history: prior,
            boardSummary: describeBoard(board.current),
            studentMessage: text ?? "",
            image,
            learner: learnerRef.current,
          }),
        });
        if (!res.ok || !res.body) {
          const data = (await res.json().catch(() => ({}))) as { error?: string };
          throw new Error(data.error || `The tutor didn't respond (error ${res.status}).`);
        }
        // Stream: start teaching the first beat while Claude is still writing the rest.
        const reader = res.body.getReader();
        const decoder = new TextDecoder();
        const parser = new BoardStreamParser();
        for (;;) {
          const { value, done } = await reader.read();
          if (done) break;
          const chunk = decoder.decode(value, { stream: true });
          const errAt = chunk.indexOf(STREAM_ERROR);
          if (errAt >= 0) throw new Error(chunk.slice(errAt + STREAM_ERROR.length).trim() || "The tutor hit a snag.");
          for (const action of parser.feed(chunk)) {
            if (!pl) {
              pl = startPlayer();
              setThinking(false);
            }
            pl.push(action as unknown as BoardAction);
          }
        }
        const turn = normalizeTurn(JSON.parse(parser.text));
        if (!pl) pl = startPlayer();
        setThinking(false);
        finishTurn(turn);
        pl.end(turn);
      } catch (e) {
        setThinking(false);
        pl?.flush();
        const message = e instanceof Error && e.message !== "Failed to fetch" ? e.message : "Couldn't reach the tutor. Check your connection.";
        // First turn of a sample lesson? Quietly fall back to the offline script so a demo never dies.
        if (lesson && historyRef.current.every((h) => h.role !== "tutor")) {
          setEngine("demo");
          setNotice("Live AI is unavailable right now, so Teacher switched to the offline lesson.");
          runDemo(null);
          return;
        }
        setError({ message, retry: text });
      } finally {
        setStreaming(false);
      }
    },
    [problem, lesson, startPlayer, finishTurn, runDemo],
  );

  // Kick off the session once fonts are ready (so handwriting measures correctly).
  useEffect(() => {
    if (started.current) return;
    started.current = true;
    const go = () => {
      measure.current = makeMeasure();
      askTutor(null, initialEngine);
    };
    const fam = getComputedStyle(document.documentElement).getPropertyValue("--font-hand").trim();
    if (document.fonts && fam) {
      Promise.race([document.fonts.load(`30px ${fam}`).catch(() => null), new Promise((r) => setTimeout(r, 1500))]).finally(go);
    } else go();
    return () => {
      stopSpeaking();
      recognizer.current?.abort();
    };
  }, [askTutor, initialEngine]);

  useEffect(() => {
    logRef.current?.scrollTo({ top: logRef.current.scrollHeight, behavior: "smooth" });
  }, [history, thinking]);

  // Collapse the problem card once teaching gets going, to save room.
  useEffect(() => {
    if (history.length === 3) setShowProblem(false);
  }, [history.length]);

  // Remember finished sessions on this device.
  useEffect(() => {
    if (lastTutor?.phase !== "wrapup") return;
    try {
      const recaps = loadRecaps();
      if (recaps[0]?.title === problem.title && Date.now() - new Date(recaps[0].date).getTime() < 60_000) return;
      recaps.unshift({ date: new Date().toISOString(), title: problem.title, subject: problem.subject, gap, result: practiceResult ?? "Finished" });
      localStorage.setItem(RECAPS_KEY, JSON.stringify(recaps.slice(0, 20)));
    } catch {}
  }, [lastTutor, problem, gap, practiceResult]);

  // ---------------------------------------------------------------- student input
  const send = useCallback(
    async (raw: string) => {
      const text = raw.trim().slice(0, 1500);
      if (!text || thinking || streaming) return;
      interrupt(); // finish the current drawing instantly, stop talking, then respond
      pushHistory({ role: "student", text });
      setInput("");
      // New ink since the last message? Show Claude the board.
      let image: string | undefined;
      if (inkCount > inkSent.current && engine === "live") {
        image = (await wb.current?.snapshot()) ?? undefined;
        inkSent.current = inkCount;
      }
      askTutor(text, engine, image);
    },
    [thinking, streaming, askTutor, engine, interrupt, inkCount],
  );

  sendRef.current = (t: string) => void send(t);
  speakingRef.current = speaking;
  busyRef.current = boardBusy;
  thinkingRef.current = thinking || streaming;
  currentLineRef.current = activeBeat >= 0 ? beatLines[activeBeat] ?? "" : beatLines.join(" ");

  useEffect(() => {
    if (lastTutor && lastTutor.verdict !== "none" && (lastTutor.phase === "wrapup" || lastTutor.phase === "practice") && practice) {
      if (lastTutor.phase === "wrapup") setPracticeResult(lastTutor.verdict === "correct" ? "Solved the practice problem ✓" : "Practiced with a hint");
    }
  }, [lastTutor, practice]);

  // ---------------------------------------------------------------- voice input
  /** One-shot: tap the mic, say one thing, it sends. */
  const toggleMic = () => {
    if (handsFreeRef.current) return setHandsFree(false);
    if (listening) {
      recognizer.current?.stop();
      return;
    }
    interrupt();
    let latest = "";
    const rec = createRecognizer({
      onText: (t, final) => {
        latest = t;
        setInput(t);
        if (final) {
          rec?.stop();
        }
      },
      onEnd: () => {
        setListening(false);
        if (latest.trim()) sendRef.current(latest);
      },
      onError: (msg) => {
        setListening(false);
        setNotice(msg);
      },
    });
    if (!rec) return;
    recognizer.current = rec;
    setListening(true);
    try {
      rec.start();
    } catch {
      setListening(false);
    }
  };

  // Hands-free: the mic stays on. Start talking to interrupt; each finished sentence is sent.
  useEffect(() => {
    handsFreeRef.current = handsFree;
    if (!handsFree) {
      recognizer.current?.abort();
      setListening(false);
      return;
    }
    let stopped = false;
    const start = () => {
      if (stopped || !handsFreeRef.current) return;
      const rec = createRecognizer(
        {
          onText: (t, final) => {
            const text = t.trim();
            if (!text) return;
            const teacherTalking = speakingRef.current || busyRef.current;
            // Ignore Teacher's own voice leaking from the speakers into the mic.
            if (teacherTalking && isEcho(text, currentLineRef.current)) return;
            if (!final) {
              if (teacherTalking && text.split(/\s+/).length >= 2) interrupt();
              setInput(text);
              return;
            }
            setInput("");
            if (thinkingRef.current) pendingVoice.current = text; // sent as soon as Teacher is ready
            else sendRef.current(text);
          },
          onEnd: () => {
            // Browsers stop listening after a pause; quietly start again.
            if (!stopped && handsFreeRef.current) setTimeout(start, 250);
          },
          onError: (msg, code) => {
            if (code === "not-allowed" || code === "service-not-allowed" || code === "audio-capture") {
              setNotice(msg);
              setHandsFree(false);
            }
          },
        },
        { continuous: true },
      );
      if (!rec) {
        setHandsFree(false);
        return;
      }
      recognizer.current = rec;
      try {
        rec.start();
        setListening(true);
      } catch {
        /* already started */
      }
    };
    start();
    return () => {
      stopped = true;
      recognizer.current?.abort();
      setListening(false);
    };
  }, [handsFree, interrupt]);

  // Something said hands-free while Teacher was busy: send it once Teacher is ready.
  useEffect(() => {
    if (!thinking && !streaming && pendingVoice.current) {
      const t = pendingVoice.current;
      pendingVoice.current = null;
      sendRef.current(t);
    }
  }, [thinking, streaming]);

  // Esc stops the voice / drawing.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") interrupt();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [interrupt]);

  useEffect(() => {
    if (!notice) return;
    const t = setTimeout(() => setNotice(null), 6000);
    return () => clearTimeout(t);
  }, [notice]);

  const lastBeatIdx = beatLines.reduce((acc, l, i) => (l ? i : acc), -1);
  const mood: Mood = listening ? "listening" : thinking ? "thinking" : happy ? "happy" : speaking || boardBusy ? "talking" : "idle";
  const focus = prefs.focus;
  const phaseIdx = PHASES.findIndex((p) => p.id === phase);
  const done = phase === "wrapup";
  const micOk = typeof window !== "undefined" && speechRecognitionSupported();

  function downloadRecap() {
    const lines = [
      `# Sidecar recap: ${problem.title}`,
      "",
      `**Problem:** ${problem.text}`,
      "",
      gap ? `**The key idea I was missing:** ${gap}` : "",
      practice ? `**Practice problem:** ${practice}` : "",
      practiceResult ? `**Result:** ${practiceResult}` : "",
      "",
      "## Conversation",
      ...history.map((h) => (h.role === "tutor" ? `- **Teacher:** ${h.turn.say}${h.turn.question ? ` _${h.turn.question}_` : ""}` : `- **Me:** ${h.text}`)),
    ].filter((l) => l !== "");
    const blob = new Blob([lines.join("\n")], { type: "text/markdown" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = `sidecar-recap-${problem.title.replace(/[^a-z0-9]+/gi, "-").slice(0, 40).toLowerCase()}.md`;
    a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 1000);
  }

  return (
    <div className={`page session-page ${focus ? "is-focus" : ""}`}>
      <TopBar onHome={onHome}>
        <StatusPill status={status} engine={engine} />
        <button className={`chip ${focus ? "chip--on" : ""}`} onClick={() => setPrefs({ focus: !focus })} aria-pressed={focus}>
          🎯 Focus
        </button>
        {(ttsSupported() || status?.voice) && (
          <button
            className={`chip ${prefs.voice ? "chip--on" : ""}`}
            onClick={() => {
              if (prefs.voice) stopSpeaking();
              setPrefs({ voice: !prefs.voice });
            }}
            aria-pressed={prefs.voice}
            title="Teacher reads explanations out loud"
          >
            {prefs.voice ? "🔊 Voice" : "🔈 Voice"}
          </button>
        )}
        <button className="chip" onClick={onBack}>
          ↩ Other problems
        </button>
      </TopBar>

      <main className="session">
        <aside className="side">
          <div className={`problem-card card ${showProblem ? "" : "problem-card--closed"}`}>
            <button className="problem-card-head" onClick={() => setShowProblem((v) => !v)} aria-expanded={showProblem}>
              <span className="tag">{problem.subject || "Problem"}</span>
              <strong><MathText text={problem.title} /></strong>
              <span aria-hidden>{showProblem ? "▾" : "▸"}</span>
            </button>
            {showProblem && <p className="problem-card-text"><MathText text={problem.text} /></p>}
          </div>

          <div className="progress card" aria-label="Session progress">
            <ol className="phases">
              {PHASES.map((p, i) => (
                <li key={p.id} className={i < phaseIdx ? "is-done" : i === phaseIdx ? "is-now" : ""}>
                  <span className="phase-dot">{i < phaseIdx ? "✓" : i + 1}</span>
                  <span className="phase-label">{p.label}</span>
                </li>
              ))}
            </ol>
            {plan.length > 0 && (
              <ul className="plan">
                {plan.map((s, i) => (
                  <li key={i} className={done || i < step ? "is-done" : i === step && phase !== "diagnose" ? "is-now" : ""}>
                    {s}
                  </li>
                ))}
              </ul>
            )}
            {gap && (
              <p className="gap">
                <span>Missing piece</span>
                {gap}
              </p>
            )}
          </div>

          <div className="log card" ref={logRef} aria-live="polite">
            {history.map((h, i) =>
              h.role === "tutor" ? (
                <div key={i} className="msg msg--tutor">
                  <Cloud size={30} mood="idle" />
                  <div>
                    <p><MathText text={h.turn.say} /></p>
                    {h.turn.question && <p className="msg-q"><MathText text={h.turn.question} /></p>}
                  </div>
                </div>
              ) : (
                <div key={i} className="msg msg--me">
                  <p><MathText text={h.text} /></p>
                </div>
              ),
            )}
            {thinking && (
              <div className="msg msg--tutor">
                <Cloud size={30} mood="thinking" />
                <p className="typing">
                  <span />
                  <span />
                  <span />
                </p>
              </div>
            )}
          </div>
        </aside>

        <section className="stage">
          <div className="board-frame">
            <div className="board-head">
              <Cloud size={focus ? 78 : 64} mood={mood} />
              <div className="caption" aria-live="polite">
                {thinking ? (
                  <span className="muted">Teacher is thinking…</span>
                ) : beatLines.some(Boolean) ? (
                  <>
                    {!streaming && lastTutor?.verdict === "correct" && <span className="verdict verdict--ok">Nice! ✓</span>}
                    {!streaming && lastTutor?.verdict === "partial" && <span className="verdict verdict--mid">Almost</span>}
                    {!streaming && lastTutor?.verdict === "incorrect" && <span className="verdict verdict--no">Not yet, and that&apos;s okay</span>}
                    {beatLines.map((line, i) =>
                      // While teaching: the line being spoken (and the one before it, fading).
                      // When done: just the last line, usually the question. The full text is in the chat.
                      line && (activeBeat === -1 ? i === lastBeatIdx : i <= activeBeat && i >= activeBeat - 1) ? (
                        <span key={i} className={`beat ${activeBeat === -1 ? "" : i === activeBeat ? "beat--now" : "beat--past"}`}>
                          {tags.some((t) => t.n === i + 1) && <span className="beat-badge">{i + 1}</span>}
                          <MathText text={line} />{" "}
                        </span>
                      ) : null,
                    )}
                  </>
                ) : lastTutor ? (
                  <>
                    {lastTutor.verdict === "correct" && <span className="verdict verdict--ok">Nice! ✓</span>}
                    {lastTutor.verdict === "partial" && <span className="verdict verdict--mid">Almost</span>}
                    {lastTutor.verdict === "incorrect" && <span className="verdict verdict--no">Not yet, and that&apos;s okay</span>}
                    <MathText text={lastTutor.say} />
                  </>
                ) : (
                  <span className="muted">Getting the whiteboard ready…</span>
                )}
              </div>
              {focus && (
                <div className="focus-meter" aria-label={`Step ${phaseIdx + 1} of ${PHASES.length}`}>
                  {PHASES.map((p, i) => (
                    <span key={p.id} className={i <= phaseIdx ? "on" : ""} />
                  ))}
                </div>
              )}
            </div>
            <div className="board-tools">
              <button className={`tool ${penMode ? "tool--on" : ""}`} onClick={() => setPenMode((v) => !v)} aria-pressed={penMode} title="Draw on the whiteboard with your mouse, finger or pen">
                ✍️ {penMode ? "Drawing on" : "Draw"}
              </button>
              {inkCount > 0 && (
                <button
                  className="tool"
                  onClick={() => {
                    wb.current?.clearInk();
                    inkSent.current = 0;
                  }}
                >
                  🧽 Clear my ink
                </button>
              )}
              {inkCount > inkSent.current && engine === "live" && !thinking && !streaming && (
                <button className="tool tool--send" onClick={() => send(input.trim() || "Take a look at what I drew on the board.")}>
                  Show Teacher my drawing →
                </button>
              )}
              <div className={`learner-chip ${learnerNew ? "learner-chip--new" : ""}`}>
                <button className="tool" onClick={() => setLearnerOpen((v) => !v)} aria-expanded={learnerOpen} title="What Teacher has learned about how you learn">
                  🧠 {learner.length ? learner[0] : "Teacher is getting to know you"}
                </button>
                {learnerOpen && (
                  <div className="learner-pop" role="dialog" aria-label="What Teacher has learned about you">
                    <strong>What Teacher has learned about you</strong>
                    {learner.length ? (
                      <ul>
                        {learner.map((n) => (
                          <li key={n}>{n}</li>
                        ))}
                      </ul>
                    ) : (
                      <p className="muted">Nothing yet. Ask questions and answer in your own words, and Teacher will adapt.</p>
                    )}
                    <p className="muted small">Saved only on this device. Teacher uses it to tailor explanations.</p>
                    {learner.length > 0 && (
                      <button
                        className="link-back small"
                        onClick={() => {
                          forgetLearner();
                          setLearner([]);
                        }}
                      >
                        Forget all
                      </button>
                    )}
                  </div>
                )}
              </div>
              <span className="tools-spacer" />
              <div className="speed" role="group" aria-label="Drawing speed" title="How fast Teacher draws. Auto matches the voice.">
                <span aria-hidden>✏️</span>
                {DRAW_SPEEDS.map((v) => (
                  <button key={v} className={(prefs.speed || 0) === v ? "is-on" : ""} onClick={() => setPrefs({ speed: v })} aria-pressed={(prefs.speed || 0) === v}>
                    {v === 0 ? "Auto" : `${v}×`}
                  </button>
                ))}
              </div>
              {prefs.voice && (
                <div className="speed" role="group" aria-label="Voice speed" title="How fast Teacher talks">
                  <span aria-hidden>🔊</span>
                  {VOICE_SPEEDS.map((v) => (
                    <button key={v} className={(prefs.voiceSpeed || 1) === v ? "is-on" : ""} onClick={() => setPrefs({ voiceSpeed: v })} aria-pressed={(prefs.voiceSpeed || 1) === v}>
                      {v}×
                    </button>
                  ))}
                </div>
              )}
            </div>
            <Whiteboard
              ref={wb}
              height={boardH}
              speed={prefs.speed || 1}
              onBusyChange={setBoardBusy}
              penMode={penMode}
              onInkChange={setInkCount}
              focusBeat={focusBeat}
              tags={tags}
              empty={
                <div className="wb-empty-inner">
                  <Cloud size={96} mood="thinking" />
                  <p>Uncapping the marker…</p>
                </div>
              }
            />
          </div>

          <div className="dock card">
            {error && (
              <div className="alert alert--row" role="alert">
                <span>{error.message}</span>
                <span className="alert-actions">
                  <button
                    className="btn btn--small"
                    onClick={() => {
                      const retry = error.retry;
                      setError(null);
                      askTutor(retry, engine);
                    }}
                  >
                    Try again
                  </button>
                  {lesson && engine === "live" && (
                    <button
                      className="btn btn--small btn--ghost"
                      onClick={() => {
                        setError(null);
                        setEngine("demo");
                        wb.current?.reset();
                        board.current = emptyBoard();
                        historyRef.current = [];
                        setHistory([]);
                        demoState.current = null;
                        runDemo(null);
                      }}
                    >
                      Use offline lesson
                    </button>
                  )}
                </span>
              </div>
            )}

            {practice && (phase === "practice" || phase === "wrapup") && (
              <div className="practice">
                <span className="practice-label">{done ? "Your solo problem" : "Your turn, solo"}</span>
                <p><MathText text={practice} /></p>
                {practiceResult && <span className="practice-result">{practiceResult}</span>}
              </div>
            )}

            {lastTutor?.question && !thinking && (
              <p className="question">
                <span aria-hidden>?</span>{" "}
                <span>
                  <MathText text={lastTutor.question} />
                </span>
              </p>
            )}
            {lastTutor && lastTutor.choices.length > 0 && !thinking && (
              <div className="choices">
                {lastTutor.choices.map((c) => (
                  <button key={c} className="choice" onClick={() => send(c)}>
                    <MathText text={c} />
                  </button>
                ))}
              </div>
            )}

            <form
              className="composer"
              onSubmit={(e) => {
                e.preventDefault();
                send(input);
              }}
            >
              <textarea
                ref={inputRef}
                value={input}
                rows={1}
                onChange={(e) => setInput(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" && !e.shiftKey) {
                    e.preventDefault();
                    send(input);
                  }
                }}
                placeholder={
                  listening
                    ? "Listening… ask anything"
                    : phase === "practice"
                      ? "Type your answer…"
                      : "Answer, or interrupt: “why did we divide there?”"
                }
                aria-label="Message Teacher"
                maxLength={1500}
              />
              {micOk && (
                <button
                  type="button"
                  className={`icon-btn ${listening ? "icon-btn--rec" : ""}`}
                  onClick={toggleMic}
                  aria-label={listening ? "Stop listening" : "Talk to Teacher"}
                  title={listening ? "Stop listening" : "Talk to Teacher"}
                  disabled={thinking && !handsFree}
                >
                  🎙️
                </button>
              )}
              {micOk && (
                <button
                  type="button"
                  className={`icon-btn icon-btn--wide ${handsFree ? "icon-btn--live" : ""}`}
                  onClick={() => setHandsFree((v) => !v)}
                  aria-pressed={handsFree}
                  title="Hands-free: keep the mic on. Just start talking to interrupt Teacher."
                >
                  {handsFree ? "🟢 Hands-free on" : "Hands-free"}
                </button>
              )}
              <button type="submit" className="btn btn--primary" disabled={!input.trim() || thinking || streaming}>
                Send
              </button>
            </form>
            {!done && (
              <div className="quick">
                {QUICK.map((q) => (
                  <button key={q} className="quick-chip" onClick={() => send(q)} disabled={thinking || !lastTutor}>
                    {q}
                  </button>
                ))}
              </div>
            )}
            {done && (
              <div className="wrap-actions">
                <button className="btn btn--primary" onClick={onBack}>
                  Pick another problem
                </button>
                <button className="btn btn--ghost" onClick={downloadRecap}>
                  ⬇ Save my recap
                </button>
              </div>
            )}
          </div>

          {videos.length > 0 && <VideoCards videos={videos} enabled={Boolean(status?.videos)} />}
        </section>
      </main>

      {notice && (
        <div className="toast" role="status">
          {notice}
        </div>
      )}
    </div>
  );
}
