"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { inkMapFromPixels, placeBox, sameMark, wrapNote, type InkMap, type Rect } from "@/lib/screen-layout";
import type { BoardAction } from "@/lib/types";

export type ScreenMark = BoardAction & { beat: number };

const INK: Record<string, string> = { ink: "#1f2d3a", blue: "#1677e8", green: "#17936a", red: "#e0452b", purple: "#7a5af0", orange: "#e57b12" };
const INK_CELL = 8; // px of screenshot per ink-map cell
const LABEL_PX = 13; // on-screen size of labels, whatever the zoom
const NOTE_PX = 16;

/** Map where the snapshot has text, lines or color, so labels can avoid them. */
function readInk(img: HTMLImageElement): InkMap | null {
  const cols = Math.ceil(img.naturalWidth / INK_CELL);
  const rows = Math.ceil(img.naturalHeight / INK_CELL);
  const c = document.createElement("canvas");
  c.width = cols;
  c.height = rows;
  const g = c.getContext("2d", { willReadFrequently: true });
  if (!g) return null;
  g.imageSmoothingQuality = "high";
  g.drawImage(img, 0, 0, cols, rows); // each pixel = the average of one cell
  return inkMapFromPixels(g.getImageData(0, 0, cols, rows).data, cols, rows, INK_CELL);
}

interface Placed {
  m: ScreenMark;
  color: string;
  /** The thing marked (box / circle bounds), in screenshot pixels. */
  shape: Rect | null;
  /** Where its label or note goes. */
  tag: Rect | null;
  lines: string[];
}

/**
 * The frame Teacher is looking at, with its marks. Marks are in the screenshot's own pixels.
 * "Work on my screen" makes this the main teaching surface: Teacher writes notes right on it.
 */
export default function ScreenPanel({
  shot,
  marks,
  focusBeat,
  sharing,
  onStop,
  teaching,
  onTeachingChange,
}: {
  shot: string | null;
  marks: ScreenMark[];
  focusBeat: number | null;
  sharing: boolean;
  onStop: () => void;
  teaching: boolean;
  onTeachingChange: (on: boolean) => void;
}) {
  const imgRef = useRef<HTMLImageElement>(null);
  const [size, setSize] = useState({ w: 1456, h: 819 });
  const [ink, setInk] = useState<InkMap | null>(null);
  const [shownW, setShownW] = useState(0);

  // Track the on-screen width so labels stay a readable, constant size at any zoom.
  useEffect(() => {
    const img = imgRef.current;
    if (!img || typeof ResizeObserver === "undefined") return;
    const ro = new ResizeObserver(() => setShownW(img.clientWidth));
    ro.observe(img);
    return () => ro.disconnect();
  }, [shot]);

  useEffect(() => {
    if (!teaching) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onTeachingChange(false);
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [teaching, onTeachingChange]);

  const { w: W, h: H } = size;
  const scale = shownW ? W / shownW : 1; // screenshot px per CSS px
  const labelFont = LABEL_PX * scale;
  const noteFont = NOTE_PX * scale;

  const placed = useMemo<Placed[]>(() => {
    const clampX = (v: number | undefined) => Math.max(0, Math.min(W, v ?? 0));
    const clampY = (v: number | undefined) => Math.max(0, Math.min(H, v ?? 0));
    const unique: ScreenMark[] = [];
    for (const m of marks) if (!unique.some((u) => sameMark(u, m))) unique.push(m);
    const r = W * 0.018;
    // Shapes first: every label must also stay off every marked thing.
    const shapes = unique.map((m): Rect | null => {
      const x = clampX(m.x), y = clampY(m.y), x2 = clampX(m.x2), y2 = clampY(m.y2);
      if (m.kind === "box") return { x: Math.min(x, x2), y: Math.min(y, y2), w: Math.max(Math.abs(x2 - x), r), h: Math.max(Math.abs(y2 - y), r * 0.8) };
      if (m.kind === "circle") return { x: x - r * 1.6, y: y - r, w: r * 3.2, h: r * 2 };
      return null;
    });
    const taken: Rect[] = shapes.filter((s): s is Rect => !!s);
    return unique.map((m, i) => {
      const color = INK[m.color ?? "red"] ?? INK.red;
      const text = (m.text ?? "").trim();
      if (!text || m.kind === "arrow") return { m, color, shape: shapes[i], tag: null, lines: [] };
      const isNote = m.kind === "note";
      const font = isNote ? noteFont : labelFont;
      const lines = isNote ? wrapNote(text, 26) : [text];
      const longest = Math.max(...lines.map((l) => l.length));
      const box = { w: longest * font * 0.55 + font * (isNote ? 1.4 : 1), h: lines.length * font * 1.3 + font * (isNote ? 0.8 : 0.35) };
      const anchor = shapes[i] ?? { x: clampX(m.x), y: clampY(m.y), w: 1, h: 1 };
      const tag = placeBox(ink, anchor, box, taken, { w: W, h: H });
      taken.push(tag);
      return { m, color, shape: shapes[i], tag, lines };
    });
  }, [marks, ink, W, H, labelFont, noteFont]);

  if (!shot) return null;

  return (
    <div className={`screen-panel ${teaching ? "screen-panel--teach" : ""}`}>
      <div className="screen-head">
        <strong>🖥 Your screen</strong>
        <span className="muted small screen-note">
          {teaching ? "Teacher works right on your screen. A fresh snapshot goes with each message." : sharing ? "A fresh snapshot goes to Teacher with each message." : "Sharing stopped. This is the last snapshot."}
        </span>
        <span className="screen-actions">
          <button className="link-back small" onClick={() => onTeachingChange(!teaching)} aria-pressed={teaching}>
            {teaching ? "Back to whiteboard" : "Work on my screen"}
          </button>
          {sharing && (
            <button className="link-back small" onClick={onStop}>
              Stop sharing
            </button>
          )}
        </span>
      </div>
      <div className="screen-frame">
        <img
          ref={imgRef}
          src={shot}
          alt="Snapshot of your shared screen"
          onLoad={(e) => {
            const img = e.currentTarget;
            if (!img.naturalWidth) return;
            setSize({ w: img.naturalWidth, h: img.naturalHeight });
            setShownW(img.clientWidth);
            setInk(readInk(img));
          }}
        />
        <svg viewBox={`0 0 ${W} ${H}`} aria-hidden>
          <defs>
            <marker id="screen-arrow" viewBox="0 0 10 10" refX="8" refY="5" markerWidth="4" markerHeight="4" orient="auto-start-reverse">
              <path d="M0,0 L10,5 L0,10 z" fill="context-stroke" />
            </marker>
          </defs>
          {placed.map(({ m, color, shape, tag, lines }, i) => {
            const cls = `screen-mark ${m.beat === focusBeat ? "screen-mark--now" : ""}`;
            const pad = W * 0.003;
            const isNote = m.kind === "note";
            const font = isNote ? noteFont : labelFont;
            return (
              <g key={i} className={cls}>
                {m.kind === "box" && shape && <rect x={shape.x - pad} y={shape.y - pad} width={shape.w + pad * 2} height={shape.h + pad * 2} rx={W * 0.004} stroke={color} pathLength={1} />}
                {m.kind === "circle" && shape && <ellipse cx={shape.x + shape.w / 2} cy={shape.y + shape.h / 2} rx={shape.w / 2} ry={shape.h / 2} stroke={color} pathLength={1} />}
                {m.kind === "arrow" && <line x1={m.x ?? 0} y1={m.y ?? 0} x2={m.x2 ?? 0} y2={m.y2 ?? 0} stroke={color} markerEnd="url(#screen-arrow)" pathLength={1} />}
                {tag && (
                  <g className={isNote ? "screen-note-card" : "screen-label"}>
                    <rect x={tag.x} y={tag.y} width={tag.w} height={tag.h} rx={isNote ? font * 0.45 : tag.h / 2} fill="#fff" stroke={color} strokeWidth={scale * (isNote ? 1.5 : 1.2)} />
                    <text x={isNote ? tag.x + font * 0.7 : tag.x + tag.w / 2} y={tag.y + (isNote ? font * 0.4 : font * 0.175)} fontSize={font} fill={isNote ? "#1f2d3a" : color} textAnchor={isNote ? "start" : "middle"} dominantBaseline="hanging">
                      {lines.map((l, j) => (
                        <tspan key={j} x={isNote ? tag.x + font * 0.7 : tag.x + tag.w / 2} dy={j ? font * 1.3 : 0}>
                          {l}
                        </tspan>
                      ))}
                    </text>
                  </g>
                )}
              </g>
            );
          })}
        </svg>
      </div>
    </div>
  );
}
