"use client";

import { useCallback, useEffect, useState } from "react";
import Home from "./Home";
import ProblemPicker from "./ProblemPicker";
import Session from "./Session";
import type { Assignment, Preferences, Problem } from "@/lib/types";

export interface AppStatus {
  live: boolean;
  model: string;
  videos: boolean;
  /** Natural (ElevenLabs) voice available. */
  voice?: boolean;
}

export type Engine = "live" | "demo";

const DEFAULT_PREFS: Preferences = { format: "visual", voice: false, focus: false, pace: "normal", speed: 0, voiceSpeed: 1 };
const PREFS_KEY = "sidecar.prefs.v1";

function loadPrefs(): Preferences {
  try {
    const raw = localStorage.getItem(PREFS_KEY);
    if (raw) return { ...DEFAULT_PREFS, ...JSON.parse(raw) };
  } catch {}
  return DEFAULT_PREFS;
}

export default function SidecarApp() {
  const [stage, setStage] = useState<"home" | "pick" | "session">("home");
  const [status, setStatus] = useState<AppStatus | null>(null);
  const [prefs, setPrefsState] = useState<Preferences>(DEFAULT_PREFS);
  const [assignment, setAssignment] = useState<Assignment | null>(null);
  const [problem, setProblem] = useState<Problem | null>(null);
  const [engine, setEngine] = useState<Engine>("demo");
  const [sessionKey, setSessionKey] = useState(0);

  useEffect(() => {
    setPrefsState(loadPrefs());
    fetch("/api/status")
      .then((r) => (r.ok ? r.json() : Promise.reject()))
      .then((s: AppStatus) => setStatus(s))
      .catch(() => setStatus({ live: false, model: "", videos: false, voice: false }));
  }, []);

  const setPrefs = useCallback((p: Partial<Preferences>) => {
    setPrefsState((prev) => {
      const next = { ...prev, ...p };
      try {
        localStorage.setItem(PREFS_KEY, JSON.stringify(next));
      } catch {}
      return next;
    });
  }, []);

  const openAssignment = (a: Assignment) => {
    setAssignment(a);
    setProblem(a.problems.length === 1 ? a.problems[0] : null);
    setStage("pick");
    window.scrollTo({ top: 0 });
  };

  const start = (p: Problem, e: Engine) => {
    setProblem(p);
    setEngine(e);
    setSessionKey((k) => k + 1);
    setStage("session");
    window.scrollTo({ top: 0 });
  };

  if (stage === "session" && assignment && problem) {
    return (
      <Session
        key={sessionKey}
        assignment={assignment}
        problem={problem}
        initialEngine={engine}
        status={status}
        prefs={prefs}
        setPrefs={setPrefs}
        onBack={() => setStage("pick")}
        onHome={() => setStage("home")}
      />
    );
  }
  if (stage === "pick" && assignment) {
    return (
      <ProblemPicker
        assignment={assignment}
        selected={problem}
        onSelect={setProblem}
        status={status}
        prefs={prefs}
        setPrefs={setPrefs}
        onStart={start}
        onBack={() => setStage("home")}
      />
    );
  }
  return <Home status={status} onAssignment={openAssignment} />;
}
