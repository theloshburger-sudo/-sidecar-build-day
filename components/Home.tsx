"use client";

import { useEffect, useRef, useState } from "react";
import Cloud from "./Cloud";
import TopBar, { StatusPill } from "./TopBar";
import type { AppStatus } from "./SidecarApp";
import { DEMO_ASSIGNMENTS } from "@/lib/demo";
import { FileProblem, readAssignmentFile } from "@/lib/files";
import { splitProblems } from "@/lib/sanitize";
import type { Assignment, Problem } from "@/lib/types";

export interface Recap {
  date: string;
  title: string;
  subject: string;
  gap: string;
  result: string;
}

export const RECAPS_KEY = "sidecar.recaps.v1";

export function loadRecaps(): Recap[] {
  try {
    return JSON.parse(localStorage.getItem(RECAPS_KEY) || "[]") as Recap[];
  } catch {
    return [];
  }
}

export default function Home({ status, onAssignment }: { status: AppStatus | null; onAssignment: (a: Assignment) => void }) {
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [dragging, setDragging] = useState(false);
  const [pasteOpen, setPasteOpen] = useState(false);
  const [pasted, setPasted] = useState("");
  const [recaps, setRecaps] = useState<Recap[]>([]);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => setRecaps(loadRecaps().slice(0, 4)), []);

  async function handleFile(file: File) {
    setError(null);
    setBusy("Reading your file…");
    try {
      const read = await readAssignmentFile(file, setBusy);
      setBusy(read.images.length ? "Teacher is reading the page…" : "Finding the problems…");
      const res = await fetch("/api/extract", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: file.name, text: read.text, images: read.images }),
      });
      const data = (await res.json().catch(() => ({}))) as { name?: string; problems?: Problem[]; error?: string };
      if (!res.ok) {
        // Server unreachable or no key: fall back to local splitting when we have text.
        if (read.text.trim()) return finish(file.name, splitProblems(read.text));
        throw new FileProblem(data.error || "We couldn't read that file. Try again or paste the problem text.");
      }
      finish(data.name || file.name, data.problems ?? []);
    } catch (e) {
      console.error("upload failed", e);
      setBusy(null);
      setError(e instanceof FileProblem ? e.message : "Something went wrong reading that file. Try again, or paste the problem text instead.");
    }
  }

  function finish(name: string, problems: Problem[]) {
    setBusy(null);
    if (!problems.length) {
      setError("We couldn't find any problems in that file. Try a clearer photo, or paste the problem text.");
      return;
    }
    onAssignment({ name: name.replace(/\.(pdf|png|jpe?g|webp|txt)$/i, ""), problems });
  }

  function submitPaste() {
    const text = pasted.trim();
    if (text.length < 5) {
      setError("Paste at least one full problem first.");
      return;
    }
    const problems = splitProblems(text);
    onAssignment({ name: "Pasted problems", problems });
  }

  return (
    <div className="page">
      <TopBar>
        <StatusPill status={status} />
      </TopBar>

      <main className="home">
        <section className="hero">
          <div className="hero-copy">
            <p className="eyebrow">Your homework, one problem at a time</p>
            <h1>
              Stuck on <em>one</em> problem?
              <br />
              Teacher sits right beside you.
            </h1>
            <p className="lede">
              Upload your assignment, pick the problem, and a patient tutor figures out the <strong>one idea you&apos;re missing</strong>, then
              draws it out on a live whiteboard. Interrupt anytime. No judgment, no giving away the answer.
            </p>
            <ul className="trust">
              <li>🔒 No account. Sidecar never saves your work on a server.</li>
              <li>🎙️ Type or talk, whichever you like</li>
            </ul>
          </div>
          <div className="hero-cloud" aria-hidden>
            <Cloud size={210} mood="happy" />
            <div className="hero-bubble">Which one&apos;s bugging you?</div>
          </div>
        </section>

        <section
          className={`upload card ${dragging ? "upload--drag" : ""} ${busy ? "upload--busy" : ""}`}
          onDragOver={(e) => {
            e.preventDefault();
            setDragging(true);
          }}
          onDragLeave={() => setDragging(false)}
          onDrop={(e) => {
            e.preventDefault();
            setDragging(false);
            const f = e.dataTransfer.files?.[0];
            if (f && !busy) handleFile(f);
          }}
        >
          <input
            ref={inputRef}
            type="file"
            hidden
            accept="application/pdf,image/*,.txt,.md"
            onChange={(e) => {
              const f = e.target.files?.[0];
              e.target.value = "";
              if (f) handleFile(f);
            }}
          />
          {busy ? (
            <div className="upload-busy" role="status">
              <Cloud size={80} mood="thinking" />
              <p>{busy}</p>
            </div>
          ) : (
            <>
              <div className="upload-icon" aria-hidden>
                ⬆
              </div>
              <h2>Drop your Canvas assignment or study guide</h2>
              <p className="muted">PDF or a photo of the page. Scans and phone pictures work too.</p>
              <div className="upload-actions">
                <button className="btn btn--primary" onClick={() => inputRef.current?.click()}>
                  Choose a file
                </button>
                <button className="btn btn--ghost" onClick={() => setPasteOpen((v) => !v)}>
                  {pasteOpen ? "Hide text box" : "Paste a problem instead"}
                </button>
              </div>
              {pasteOpen && (
                <div className="paste">
                  <textarea
                    value={pasted}
                    onChange={(e) => setPasted(e.target.value)}
                    placeholder={"e.g.\n1. Solve for x: 2(x + 3) = 14\n2. Find the vertex of y = x² − 4x + 1"}
                    rows={5}
                    maxLength={20000}
                  />
                  <button className="btn btn--primary" onClick={submitPaste} disabled={!pasted.trim()}>
                    Use these problems
                  </button>
                </div>
              )}
            </>
          )}
          {error && (
            <p className="alert" role="alert">
              {error}
            </p>
          )}
        </section>

        <section className="demos">
          <div className="section-head">
            <h2>No assignment handy? Try a sample</h2>
            <p className="muted">These run fully offline, even with no internet or API key.</p>
          </div>
          <div className="demo-grid">
            {DEMO_ASSIGNMENTS.map((d) => (
              <button key={d.demoId} className="demo-card card" onClick={() => onAssignment(d)}>
                <span className={`demo-emoji demo-emoji--${d.demoId}`}>{d.emoji}</span>
                <strong>{d.name}</strong>
                <span className="muted">{d.blurb}</span>
              </button>
            ))}
          </div>
        </section>

        {recaps.length > 0 && (
          <section className="recents">
            <div className="section-head">
              <h2>What you&apos;ve cracked lately</h2>
            </div>
            <ul className="recent-list">
              {recaps.map((r, i) => (
                <li key={i} className="card">
                  <span className="tag">{r.subject || "Session"}</span>
                  <strong>{r.title}</strong>
                  {r.gap && <span className="muted">Key idea: {r.gap}</span>}
                  <span className="recent-meta">
                    {new Date(r.date).toLocaleDateString()} · {r.result}
                  </span>
                </li>
              ))}
            </ul>
          </section>
        )}

        <section className="how">
          <div className="how-step">
            <span>1</span>
            <strong>Upload & pick</strong>
            <p>Drop the PDF or photo, then tap the exact problem you&apos;re stuck on.</p>
          </div>
          <div className="how-step">
            <span>2</span>
            <strong>Find the gap</strong>
            <p>Teacher asks one or two quick questions to find the idea that&apos;s actually missing.</p>
          </div>
          <div className="how-step">
            <span>3</span>
            <strong>Learn it, prove it</strong>
            <p>Watch it drawn step by step, ask &ldquo;why?&rdquo; anytime, then solve a fresh one on your own.</p>
          </div>
        </section>
      </main>
      <footer className="foot muted">Built for Build Day #1 · Sidecar keeps your work in your browser.</footer>
    </div>
  );
}
