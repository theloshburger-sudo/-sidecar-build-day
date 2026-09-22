"use client";

import Cloud from "./Cloud";
import type { AppStatus } from "./SidecarApp";

export function StatusPill({ status, engine }: { status: AppStatus | null; engine?: "live" | "demo" }) {
  if (!status) return <span className="pill pill--muted">Checking…</span>;
  const mode = engine ?? (status.live ? "live" : "demo");
  if (mode === "live") {
    return (
      <span className="pill pill--live" title={`Live tutoring with ${status.model}`}>
        <span className="dot" /> Live AI
      </span>
    );
  }
  return (
    <span className="pill pill--demo" title="Scripted offline lesson: works with no internet or API key">
      <span className="dot" /> Offline demo
    </span>
  );
}

export default function TopBar({ onHome, children }: { onHome?: () => void; children?: React.ReactNode }) {
  return (
    <header className="topbar">
      <button className="brand" onClick={onHome} aria-label="Sidecar home">
        <Cloud size={40} mood="idle" />
        <span>
          <strong>Sidecar</strong>
          <small>a patient tutor for this exact problem</small>
        </span>
      </button>
      <div className="topbar-actions">{children}</div>
    </header>
  );
}
