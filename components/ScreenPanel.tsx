"use client";

import { useState } from "react";
import type { BoardAction } from "@/lib/types";

export type ScreenMark = BoardAction & { beat: number };

const INK: Record<string, string> = { ink: "#1f2d3a", blue: "#1677e8", green: "#17936a", red: "#e0452b", purple: "#7a5af0", orange: "#e57b12" };

/** The frame Teacher is looking at, with its marks drawn over it on a 0–1000 grid. */
export default function ScreenPanel({ shot, marks, focusBeat, sharing, onStop }: { shot: string | null; marks: ScreenMark[]; focusBeat: number | null; sharing: boolean; onStop: () => void }) {
  // Marks use a 0–1000 grid on both axes; draw them in the image's real proportions so circles stay round.
  const [ratio, setRatio] = useState(9 / 16);
  if (!shot) return null;
  const H = 1000 * ratio;
  return (
    <div className="screen-panel">
      <div className="screen-head">
        <strong>🖥 Your screen</strong>
        <span className="muted small">{sharing ? "Teacher sees a fresh snapshot each time you send a message." : "Sharing stopped. This is the last snapshot."}</span>
        {sharing && (
          <button className="link-back small" onClick={onStop}>
            Stop sharing
          </button>
        )}
      </div>
      <div className="screen-frame">
        <img src={shot} alt="Snapshot of your shared screen" onLoad={(e) => setRatio(e.currentTarget.naturalHeight / e.currentTarget.naturalWidth || 9 / 16)} />
        <svg viewBox={`0 0 1000 ${H}`} aria-hidden>
          <defs>
            <marker id="screen-arrow" viewBox="0 0 10 10" refX="8" refY="5" markerWidth="5" markerHeight="5" orient="auto-start-reverse">
              <path d="M0,0 L10,5 L0,10 z" fill="context-stroke" />
            </marker>
          </defs>
          {marks.map((m, i) => {
            const c = INK[m.color ?? "red"] ?? INK.red;
            const cls = `screen-mark ${m.beat === focusBeat ? "screen-mark--now" : ""}`;
            const x = m.x ?? 0;
            const y = (m.y ?? 0) * ratio;
            const y2 = (m.y2 ?? 0) * ratio;
            const label = m.text ? (
              <text x={Math.min(x + 4, 930)} y={Math.max(y - 26, 24)} className="screen-label" fill={c}>
                {m.text}
              </text>
            ) : null;
            if (m.kind === "box")
              return (
                <g key={i} className={cls}>
                  <rect x={Math.min(x, m.x2 ?? x)} y={Math.min(y, y2)} width={Math.abs((m.x2 ?? x) - x) || 40} height={Math.abs(y2 - y) || 40} rx="8" stroke={c} pathLength={1} />
                  {label}
                </g>
              );
            if (m.kind === "arrow")
              return (
                <g key={i} className={cls}>
                  <line x1={x} y1={y} x2={m.x2 ?? x} y2={y2} stroke={c} markerEnd="url(#screen-arrow)" pathLength={1} />
                  {label}
                </g>
              );
            if (m.kind === "label")
              return (
                <g key={i} className={cls}>
                  <text x={x} y={y} className="screen-label" fill={c}>
                    {m.text}
                  </text>
                </g>
              );
            return (
              <g key={i} className={cls}>
                <ellipse cx={x} cy={y} rx="40" ry="40" stroke={c} pathLength={1} />
                {label}
              </g>
            );
          })}
        </svg>
      </div>
    </div>
  );
}
