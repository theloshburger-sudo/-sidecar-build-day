"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Cloud, { type Mood } from "./Cloud";
import TopBar, { StatusPill } from "./TopBar";
import Whiteboard, { type WhiteboardHandle } from "./Whiteboard";
import VideoCards from "./VideoCards";
import { RECAPS_KEY, loadRecaps } from "./Home";
import type { AppStatus, Engine } from "./SidecarApp";
import { applyActions, boardHeight, describeBoard, emptyBoard, BOARD_MIN_H, type BoardState, type Measure } from "@/lib/board";
import { getDemo } from "@/lib/demo";
import { demoReply, demoStart, type DemoState } from "@/lib/demo-engine";
import { createRecognizer, speak, speechRecognitionSupported, stopSpeaking, ttsSupported } from "@/lib/speech";
import type { Assignment, ChatEntry, Phase, Preferences, Problem, TutorTurn, VideoSuggestion } from "@/lib/types";

const PHASES: { id: Phase; label: string }[] = [
  { id: "diagnose", label: "Find the gap" },
  { id: "teach", label: "Learn it" },
  { id: "check", label: "Check" },
  { id: "practice", label: "Try one solo" },
  { id: "wrapup", label: "Done" },
];

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

  // ---------------------------------------------------------------- applying a turn
  const applyTurn = useCallback((turn: TutorTurn) => {
    pushHistory({ role: "tutor", turn });
    const m = measure.current ?? undefined;
    const res = applyActions(board.current, turn.board, m);
    board.current = res.state;
    setBoardH(boardHeight(res.state));
    wb.current?.enqueue(res.prims);
    if (turn.plan.length) setPlan(turn.plan);
    if (turn.gap) setGap(turn.gap);
    if (turn.videos.length) setVideos(turn.videos);
    if (turn.practice) setPractice(turn.practice);
    if (turn.verdict === "correct") {
      setHappy(true);
      setTimeout(() => setHappy(false), 2600);
    }
    if (prefsRef.current.voice && ttsSupported()) {
      speak(turn.say, { slow: prefsRef.current.pace === "slow", onStart: () => setSpeaking(true), onEnd: () => setSpeaking(false) });
    }
  }, []);

  // ---------------------------------------------------------------- asking the tutor
  const runDemo = useCallback(
    (text: string | null) => {
      if (!lesson) return;
      setThinking(true);
      const delay = 500 + Math.random() * 400;
      setTimeout(() => {
        const r = text === null || !demoState.current ? demoStart(lesson) : demoReply(lesson, demoState.current, text);
        demoState.current = r.state;
        setThinking(false);
        applyTurn(r.turn);
      }, delay);
    },
    [lesson, applyTurn],
  );

  const askTutor = useCallback(
    async (text: string | null, useEngine: Engine) => {
      setError(null);
      if (useEngine === "demo") return runDemo(text);
      setThinking(true);
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
          }),
        });
        const data = (await res.json().catch(() => ({}))) as { turn?: TutorTurn; error?: string };
        if (!res.ok || !data.turn) throw new Error(data.error || `The tutor didn't respond (error ${res.status}).`);
        setThinking(false);
        applyTurn(data.turn);
      } catch (e) {
        setThinking(false);
        const message = e instanceof Error && e.message !== "Failed to fetch" ? e.message : "Couldn't reach the tutor. Check your connection.";
        // First turn of a sample lesson? Quietly fall back to the offline script so a demo never dies.
        if (lesson && historyRef.current.every((h) => h.role !== "tutor")) {
          setEngine("demo");
          setNotice("Live AI is unavailable right now, so Teacher switched to the offline lesson.");
          runDemo(null);
          return;
        }
        setError({ message, retry: text });
      }
    },
    [problem, lesson, applyTurn, runDemo],
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
    (raw: string) => {
      const text = raw.trim().slice(0, 1500);
      if (!text || thinking) return;
      stopSpeaking();
      setSpeaking(false);
      wb.current?.finishNow(); // interruption: finish drawing instantly, then respond
      pushHistory({ role: "student", text });
      setInput("");
      askTutor(text, engine);
    },
    [thinking, askTutor, engine],
  );

  useEffect(() => {
    if (lastTutor && lastTutor.verdict !== "none" && (lastTutor.phase === "wrapup" || lastTutor.phase === "practice") && practice) {
      if (lastTutor.phase === "wrapup") setPracticeResult(lastTutor.verdict === "correct" ? "Solved the practice problem ✓" : "Practiced with a hint");
    }
  }, [lastTutor, practice]);

  const toggleMic = () => {
    if (listening) {
      recognizer.current?.stop();
      return;
    }
    stopSpeaking();
    wb.current?.finishNow();
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
        if (latest.trim()) send(latest);
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

  // Esc stops the voice / drawing.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        stopSpeaking();
        setSpeaking(false);
        wb.current?.finishNow();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  useEffect(() => {
    if (!notice) return;
    const t = setTimeout(() => setNotice(null), 6000);
    return () => clearTimeout(t);
  }, [notice]);

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
        {ttsSupported() && (
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
        <button
          className={`chip ${prefs.pace === "slow" ? "chip--on" : ""}`}
          onClick={() => setPrefs({ pace: prefs.pace === "slow" ? "normal" : "slow" })}
          aria-pressed={prefs.pace === "slow"}
          title="Slower drawing and smaller steps"
        >
          🐢 Slower
        </button>
        <button className="chip" onClick={onBack}>
          ↩ Other problems
        </button>
      </TopBar>

      <main className="session">
        <aside className="side">
          <div className={`problem-card card ${showProblem ? "" : "problem-card--closed"}`}>
            <button className="problem-card-head" onClick={() => setShowProblem((v) => !v)} aria-expanded={showProblem}>
              <span className="tag">{problem.subject || "Problem"}</span>
              <strong>{problem.title}</strong>
              <span aria-hidden>{showProblem ? "▾" : "▸"}</span>
            </button>
            {showProblem && <p className="problem-card-text">{problem.text}</p>}
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
                    <p>{h.turn.say}</p>
                    {h.turn.question && <p className="msg-q">{h.turn.question}</p>}
                  </div>
                </div>
              ) : (
                <div key={i} className="msg msg--me">
                  <p>{h.text}</p>
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
                ) : lastTutor ? (
                  <>
                    {lastTutor.verdict === "correct" && <span className="verdict verdict--ok">Nice! ✓</span>}
                    {lastTutor.verdict === "partial" && <span className="verdict verdict--mid">Almost</span>}
                    {lastTutor.verdict === "incorrect" && <span className="verdict verdict--no">Not yet, and that&apos;s okay</span>}
                    {lastTutor.say}
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
            <Whiteboard
              ref={wb}
              height={boardH}
              speed={prefs.pace === "slow" ? 0.6 : 1}
              onBusyChange={setBoardBusy}
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
                <p>{practice}</p>
                {practiceResult && <span className="practice-result">{practiceResult}</span>}
              </div>
            )}

            {lastTutor?.question && !thinking && (
              <p className="question">
                <span aria-hidden>?</span> {lastTutor.question}
              </p>
            )}
            {lastTutor && lastTutor.choices.length > 0 && !thinking && (
              <div className="choices">
                {lastTutor.choices.map((c) => (
                  <button key={c} className="choice" onClick={() => send(c)}>
                    {c}
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
                  disabled={thinking}
                >
                  🎙️
                </button>
              )}
              <button type="submit" className="btn btn--primary" disabled={!input.trim() || thinking}>
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
