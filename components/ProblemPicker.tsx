"use client";

import { useEffect, useState } from "react";
import TopBar, { StatusPill } from "./TopBar";
import type { AppStatus, Engine } from "./SidecarApp";
import { getDemo } from "@/lib/demo";
import { forgetLearner, loadLearner } from "@/lib/profile";
import type { Assignment, Preferences, Problem } from "@/lib/types";

export default function ProblemPicker({
  assignment,
  selected,
  onSelect,
  status,
  prefs,
  setPrefs,
  onStart,
  onBack,
}: {
  assignment: Assignment;
  selected: Problem | null;
  onSelect: (p: Problem) => void;
  status: AppStatus | null;
  prefs: Preferences;
  setPrefs: (p: Partial<Preferences>) => void;
  onStart: (p: Problem, engine: Engine) => void;
  onBack: () => void;
}) {
  const demo = getDemo(assignment.demoId);
  const live = Boolean(status?.live);
  const [preferDemo, setPreferDemo] = useState(false);
  const [learner, setLearner] = useState<string[]>([]);
  useEffect(() => setLearner(loadLearner()), []);

  const hasScript = (p: Problem | null) => Boolean(p && demo && demo.lesson.problemId === p.id);
  const engineFor = (p: Problem | null): Engine | null => {
    if (!p) return null;
    if (hasScript(p) && (!live || preferDemo)) return "demo";
    if (live) return "live";
    return null;
  };
  const engine = engineFor(selected);

  return (
    <div className="page">
      <TopBar onHome={onBack}>
        <StatusPill status={status} />
      </TopBar>
      <main className="picker">
        <section className="picker-main">
          <button className="link-back" onClick={onBack}>
            ← Upload something else
          </button>
          <h1 className="picker-title">{assignment.name}</h1>
          <p className="muted">
            {assignment.problems.length === 1 ? "We found 1 problem." : `We found ${assignment.problems.length} problems.`} Which one are you stuck on?
          </p>
          <ul className="problem-list" role="radiogroup" aria-label="Problems">
            {assignment.problems.map((p) => {
              const active = selected?.id === p.id;
              const scripted = hasScript(p);
              const unavailable = !live && !scripted;
              return (
                <li key={p.id}>
                  <button
                    role="radio"
                    aria-checked={active}
                    className={`problem card ${active ? "problem--active" : ""} ${unavailable ? "problem--dim" : ""}`}
                    onClick={() => onSelect(p)}
                  >
                    <span className="problem-radio" aria-hidden />
                    <span className="problem-body">
                      <span className="problem-top">
                        <strong>{p.title}</strong>
                        {p.subject && <span className="tag">{p.subject}</span>}
                        {scripted && <span className="tag tag--star">★ offline lesson</span>}
                      </span>
                      <span className="problem-text">{p.text}</span>
                    </span>
                  </button>
                </li>
              );
            })}
          </ul>
        </section>

        <aside className="picker-side card">
          <h2>Your Teacher</h2>
          <p className="muted small">Teacher works through it with you on the whiteboard, and adapts to how you learn as you ask questions.</p>
          <div className="learner-card">
            <strong>🧠 What Teacher has learned about you</strong>
            {learner.length ? (
              <>
                <ul>
                  {learner.slice(0, 5).map((n) => (
                    <li key={n}>{n}</li>
                  ))}
                </ul>
                <button
                  className="link-back small"
                  onClick={() => {
                    forgetLearner();
                    setLearner([]);
                  }}
                >
                  Forget this
                </button>
              </>
            ) : (
              <p className="muted small">Nothing yet. As you work, Teacher notes what helps you learn, like &ldquo;wants the why behind each step.&rdquo; It stays on this device only.</p>
            )}
          </div>

          <div className="toggles">
            <label className="toggle">
              <input type="checkbox" checked={prefs.pace === "slow"} onChange={(e) => setPrefs({ pace: e.target.checked ? "slow" : "normal" })} />
              <span>
                <strong>Extra-small steps</strong>
                <small>Teacher breaks ideas into tinier pieces</small>
              </span>
            </label>
            <label className="toggle">
              <input type="checkbox" checked={prefs.voice} onChange={(e) => setPrefs({ voice: e.target.checked })} />
              <span>
                <strong>Teacher talks out loud</strong>
                <small>{status?.voice ? "Natural AI voice, synced with the drawing" : "Synced with the drawing"}</small>
              </span>
            </label>
            <label className="toggle">
              <input type="checkbox" checked={prefs.focus} onChange={(e) => setPrefs({ focus: e.target.checked })} />
              <span>
                <strong>Focus mode</strong>
                <small>Just the board, the question and your progress</small>
              </span>
            </label>
            {live && hasScript(selected) && (
              <label className="toggle">
                <input type="checkbox" checked={preferDemo} onChange={(e) => setPreferDemo(e.target.checked)} />
                <span>
                  <strong>Use the offline scripted lesson</strong>
                  <small>Backup for demos, with no AI calls</small>
                </span>
              </label>
            )}
          </div>

          {selected && !engine && (
            <p className="alert">
              Live AI isn&apos;t set up on this deployment, so only the ★ sample lessons work right now. The owner needs to add an ANTHROPIC_API_KEY.
            </p>
          )}
          <button className="btn btn--primary btn--big" disabled={!selected || !engine} onClick={() => selected && engine && onStart(selected, engine)}>
            {selected ? "Start with Teacher →" : "Pick a problem first"}
          </button>
        </aside>
      </main>
    </div>
  );
}
