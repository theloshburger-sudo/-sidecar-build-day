"use client";

import { useEffect, useRef, useState } from "react";
import type { BoardAction } from "@/lib/types";

export type ScreenMark = BoardAction & { beat: number };

const INK: Record<string, string> = { ink: "#1f2d3a", blue: "#1677e8", green: "#17936a", red: "#e0452b", purple: "#7a5af0", orange: "#e57b12" };

/**
 * The frame Teacher is looking at, with its marks drawn over it. Marks are in the screenshot's own
 * pixels (the size Teacher was told), so the overlay uses the image's natural size as its viewBox.
 */
export default function ScreenPanel({ shot, marks, focusBeat, sharing, onStop }: { shot: string | null; marks: ScreenMark[]; focusBeat: number | null; sharing: boolean; onStop: () => void }) {
  const [size, setSize] = useState({ w: 1456, h: 819 });
  // Enlarged: the same snapshot (marks included) shown big over the page, for reading small text.
  const [big, setBig] = useState(false);
  const openBtn = useRef<HTMLButtonElement>(null);
  const closeBtn = useRef<HTMLButtonElement>(null);
  const wasBig = useRef(false);
  useEffect(() => {
    // Focus goes into the enlarged view and back to "Enlarge" when it closes.
    if (big) closeBtn.current?.focus();
    else if (wasBig.current) openBtn.current?.focus();
    wasBig.current = big;
    if (!big) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setBig(false);
      // Only one control inside: keep Tab on it instead of wandering into the page behind.
      if (e.key === "Tab") {
        e.preventDefault();
        closeBtn.current?.focus();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [big]);
  if (!shot) return null;
  const { w: W, h: H } = size;
  const clampX = (v: number | undefined) => Math.max(0, Math.min(W, v ?? 0));
  const clampY = (v: number | undefined) => Math.max(0, Math.min(H, v ?? 0));
  // Sizes scale with the screenshot, so marks look the same in the small panel and when enlarged.
  const r = W * 0.018;
  const font = W * 0.0165;

  /** A small pill label beside the mark, kept inside the image and off the spot itself. */
  const label = (text: string | undefined, ax: number, ay: number, color: string, beside = false) => {
    if (!text) return null;
    const tw = text.length * font * 0.56 + font;
    const th = font * 1.5;
    const gap = W * 0.006;
    // Beside (boxes): just right of the box, centered on it; flips to the left edge if there's no room.
    const lx = beside ? (ax + gap + tw <= W ? ax + gap : Math.max(2, ax - tw - gap)) : Math.min(Math.max(ax + r * 1.1, 2), W - tw - 2);
    const ly = beside ? Math.min(Math.max(ay - th / 2, 2), H - th - 2) : ay - r * 1.1 - th < 2 ? ay + r * 1.1 : ay - r * 1.1 - th;
    return (
      <g className="screen-label">
        <rect x={lx} y={ly} width={tw} height={th} rx={th / 2} fill="#fff" stroke={color} strokeWidth={W * 0.0012} />
        <text x={lx + tw / 2} y={ly + th / 2} fontSize={font} fill={color} textAnchor="middle" dominantBaseline="central">
          {text}
        </text>
      </g>
    );
  };

  return (
    <>
    {big && <div className="screen-backdrop" onClick={() => setBig(false)} aria-hidden />}
    <div className={`screen-panel ${big ? "screen-panel--big" : ""}`} role={big ? "dialog" : undefined} aria-modal={big || undefined} aria-label={big ? "Your screen, enlarged" : undefined}>
      <div className="screen-head">
        <strong>🖥 Your screen</strong>
        <span className="muted small screen-note">{sharing ? "A fresh snapshot goes to Teacher with each message." : "Sharing stopped. This is the last snapshot."}</span>
        <span className="screen-actions">
          {big ? (
            <button ref={closeBtn} className="link-back small" onClick={() => setBig(false)}>
              Close
            </button>
          ) : (
            <button ref={openBtn} className="link-back small" onClick={() => setBig(true)}>
              Enlarge
            </button>
          )}
          {sharing && !big && (
            <button className="link-back small" onClick={onStop}>
              Stop sharing
            </button>
          )}
        </span>
      </div>
      <div className="screen-frame">
        <img src={shot} alt="Snapshot of your shared screen" onLoad={(e) => e.currentTarget.naturalWidth && setSize({ w: e.currentTarget.naturalWidth, h: e.currentTarget.naturalHeight })} />
        <svg viewBox={`0 0 ${W} ${H}`} aria-hidden>
          <defs>
            <marker id="screen-arrow" viewBox="0 0 10 10" refX="8" refY="5" markerWidth="4" markerHeight="4" orient="auto-start-reverse">
              <path d="M0,0 L10,5 L0,10 z" fill="context-stroke" />
            </marker>
          </defs>
          {marks.map((m, i) => {
            const c = INK[m.color ?? "red"] ?? INK.red;
            const cls = `screen-mark ${m.beat === focusBeat ? "screen-mark--now" : ""}`;
            const x = clampX(m.x);
            const y = clampY(m.y);
            const x2 = clampX(m.x2);
            const y2 = clampY(m.y2);
            if (m.kind === "box") {
              const bx = Math.min(x, x2);
              const by = Math.min(y, y2);
              const pad = W * 0.004;
              return (
                <g key={i} className={cls}>
                  <rect x={bx - pad} y={by - pad} width={Math.max(Math.abs(x2 - x), r) + pad * 2} height={Math.max(Math.abs(y2 - y), r * 0.8) + pad * 2} rx={W * 0.004} stroke={c} pathLength={1} />
                  {label(m.text, Math.max(x, x2) + pad, (y + y2) / 2, c, true)}
                </g>
              );
            }
            if (m.kind === "arrow")
              return (
                <g key={i} className={cls}>
                  <line x1={x} y1={y} x2={x2} y2={y2} stroke={c} markerEnd="url(#screen-arrow)" pathLength={1} />
                  {label(m.text, x, y, c)}
                </g>
              );
            if (m.kind === "label") return <g key={i} className={cls}>{label(m.text, x - r * 1.1, y + r * 1.1, c)}</g>;
            return (
              <g key={i} className={cls}>
                <ellipse cx={x} cy={y} rx={r * 1.6} ry={r} stroke={c} pathLength={1} />
                {label(m.text, x + r * 0.6, y, c)}
              </g>
            );
          })}
        </svg>
      </div>
    </div>
    </>
  );
}
