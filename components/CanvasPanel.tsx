"use client";

import { useCallback, useEffect, useState } from "react";
import { authFetch, useAccount } from "@/lib/account";

export interface CanvasItem {
  courseId: number;
  courseName: string;
  assignmentId: number;
  name: string;
  dueAt: string | null;
  url: string;
  kind: "assignment" | "quiz";
}

function due(iso: string | null): { text: string; late: boolean } {
  if (!iso) return { text: "no due date", late: false };
  const d = new Date(iso);
  const days = Math.floor((d.getTime() - Date.now()) / 86_400_000);
  if (d.getTime() < Date.now()) return { text: "past due", late: true };
  const day = days === 0 ? "today" : days === 1 ? "tomorrow" : d.toLocaleDateString(undefined, { weekday: "short", month: "short", day: "numeric" });
  return { text: `due ${day}, ${d.toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" })}`, late: false };
}

/** "Due soon from Canvas": connect once with a personal access token, then open any assignment in one tap. */
export default function CanvasPanel({ enabled, onOpen }: { enabled: boolean; onOpen: (item: CanvasItem) => void }) {
  const { user } = useAccount();
  const [linked, setLinked] = useState<boolean | null>(null);
  const [items, setItems] = useState<CanvasItem[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [baseUrl, setBaseUrl] = useState("https://canvas.calpoly.edu");
  const [token, setToken] = useState("");

  const load = useCallback(async () => {
    setError(null);
    const r = await authFetch("/api/canvas/todo");
    const data = (await r.json().catch(() => ({}))) as { items?: CanvasItem[]; error?: string; code?: string };
    if (r.ok) return setItems(data.items ?? []);
    if (data.code === "not_linked") return setLinked(false);
    if (data.code === "token_rejected") setLinked(false);
    setError(data.error ?? "Couldn't load Canvas.");
  }, []);

  useEffect(() => {
    if (!enabled || !user) return;
    authFetch("/api/canvas/link")
      .then((r) => r.json())
      .then((d: { linked?: boolean; baseUrl?: string }) => {
        setLinked(Boolean(d.linked));
        if (d.baseUrl) setBaseUrl(d.baseUrl);
        if (d.linked) void load();
      })
      .catch(() => setLinked(false));
  }, [enabled, user, load]);

  if (!enabled || !user || linked === null) return null;

  async function connect(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const r = await authFetch("/api/canvas/link", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ baseUrl, token }) });
      const data = (await r.json().catch(() => ({}))) as { error?: string; baseUrl?: string };
      if (!r.ok) throw new Error(data.error ?? "Couldn't connect.");
      setToken("");
      setLinked(true);
      if (data.baseUrl) setBaseUrl(data.baseUrl);
      await load();
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  }

  async function disconnect() {
    if (!confirm("Disconnect Canvas? Sidecar will delete the saved token.")) return;
    await authFetch("/api/canvas/link", { method: "DELETE" });
    setLinked(false);
    setItems(null);
  }

  return (
    <section className="canvas-panel">
      <div className="section-head">
        <h2>{linked ? "Due soon from Canvas" : "Connect Canvas"}</h2>
        {linked && (
          <button className="link-back small" onClick={disconnect}>
            Disconnect
          </button>
        )}
      </div>
      {!linked ? (
        <form className="card canvas-connect" onSubmit={connect}>
          <p className="muted">Your assignments show up here, so you can open one in a tap with no download or upload.</p>
          <ol className="canvas-steps">
            <li>
              In Canvas, open <strong>Account → Settings</strong>.
            </li>
            <li>
              Under <strong>Approved Integrations</strong>, click <strong>+ New Access Token</strong>, name it &ldquo;Sidecar&rdquo;, and generate it.
            </li>
            <li>Copy the token and paste it below. (Canvas only shows it once.)</li>
          </ol>
          <label>
            Your Canvas address
            <input value={baseUrl} onChange={(e) => setBaseUrl(e.target.value)} inputMode="url" autoComplete="url" required />
          </label>
          <label>
            Access token
            <input type="password" value={token} onChange={(e) => setToken(e.target.value)} autoComplete="off" required placeholder="1234~…" />
          </label>
          <button className="btn btn--primary" disabled={busy || !token.trim()}>
            {busy ? "Checking with Canvas…" : "Connect Canvas"}
          </button>
          <p className="muted small">The token is encrypted and only used to read your assignments. Disconnect anytime, or delete the token in Canvas.</p>
        </form>
      ) : items === null && !error ? (
        <p className="muted">Loading your assignments…</p>
      ) : items && items.length ? (
        <ul className="canvas-list">
          {items.map((it) => {
            const d = due(it.dueAt);
            return (
              <li key={`${it.courseId}-${it.assignmentId}`} className="card canvas-item">
                <span className="tag">{it.courseName || "Course"}</span>
                <strong>{it.name}</strong>
                <span className={`canvas-due ${d.late ? "canvas-due--late" : ""}`}>{d.text}</span>
                <span className="canvas-actions">
                  <button className="btn btn--primary spot-review" onClick={() => onOpen(it)}>
                    Work on this
                  </button>
                  <a className="link-back small" href={it.url} target="_blank" rel="noreferrer">
                    Open in Canvas ↗
                  </a>
                </span>
              </li>
            );
          })}
        </ul>
      ) : items ? (
        <p className="muted">Nothing due in the next two weeks. 🎉</p>
      ) : null}
      {error && (
        <p className="alert" role="alert">
          {error}
        </p>
      )}
    </section>
  );
}
