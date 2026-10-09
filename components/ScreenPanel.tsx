"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { gridFromImage, inkUnder, snapBox, type Grid } from "@/lib/screen-snap";
import type { BoardAction } from "@/lib/types";

export type ScreenMark = BoardAction & { beat: number };

const INK: Record<string, string> = { ink: "#1f2d3a", blue: "#1677e8", green: "#17936a", red: "#e0452b", purple: "#7a5af0", orange: "#e57b12" };
const SNAP_CELL = 3; // screenshot px per content-grid cell

/** Where the snapshot has text, lines or color, read from its pixels (for fitting boxes to content). */
function readGrid(img: HTMLImageElement): Grid | null {
  const w = img.naturalWidth;
  const h = img.naturalHeight;
  const c = document.createElement("canvas");
  c.width = w;
  c.height = h;
  const g = c.getContext("2d", { willReadFrequently: true });
  if (!g) return null;
  g.drawImage(img, 0, 0);
  return gridFromImage(g.getImageData(0, 0, w, h).data, w, h, SNAP_CELL);
}

/**
 * The frame Teacher is looking at, with its marks drawn over it. Marks are in the screenshot's own
 * pixels (the size Teacher was told), so the overlay uses the image's natural size as its viewBox.
 */
export default function ScreenPanel({ shot, marks, focusBeat, sharing, onStop, viewsSeen = 0 }: { shot: string | null; marks: ScreenMark[]; focusBeat: number | null; sharing: boolean; onStop: () => void; viewsSeen?: number }) {
  const [size, setSize] = useState({ w: 1456, h: 819 });
  // The content grid belongs to one snapshot: a stale one is ignored instead of reset (resetting in an
  // effect raced the image's load event, which can fire first for an inline image).
  const [built, setBuilt] = useState<{ shot: string; grid: Grid } | null>(null);
  const grid = built && built.shot === shot ? built.grid : null;
  const imgRef = useRef<HTMLImageElement>(null);
  const buildGrid = (img: HTMLImageElement | null) => {
    if (!img || !shot || !img.complete || !img.naturalWidth) return;
    setSize({ w: img.naturalWidth, h: img.naturalHeight });
    const g = readGrid(img);
    if (g) setBuilt({ shot, grid: g });
  };
  // Already loaded before React saw it (cached / instant decode): build now.
  useEffect(() => {
    if (!grid) buildGrid(imgRef.current);
  });
  // Fit each box (and circle) to the real content Teacher aimed at.
  const fitted = useMemo(
    () =>
      marks.map((m) => {
        if (!grid) return m;
        if (m.kind === "box") {
          const b = snapBox(grid, { x1: m.x ?? 0, y1: m.y ?? 0, x2: m.x2 ?? 0, y2: m.y2 ?? 0 });
          return { ...m, x: b.x1, y: b.y1, x2: b.x2, y2: b.y2 };
        }
        if (m.kind === "circle") {
          const r = grid.cell * 6;
          const b = snapBox(grid, { x1: (m.x ?? 0) - r, y1: (m.y ?? 0) - r / 2, x2: (m.x ?? 0) + r, y2: (m.y ?? 0) + r / 2 });
          return { ...m, x: (b.x1 + b.x2) / 2, y: (b.y1 + b.y2) / 2, x2: b.x2 - b.x1, y2: b.y2 - b.y1 };
        }
        return m;
      }),
    [marks, grid],
  );
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
  const label = (text: string | undefined, ax: number, ay: number, color: string, beside = false, box?: { x: number; y: number; w: number; h: number }) => {
    if (!text) return null;
    const tw = text.length * font * 0.56 + font;
    const th = font * 1.5;
    const gap = W * 0.006;
    // Beside (boxes): just right of the box, centered on it; flips to the left edge if there's no room.
    let lx = beside ? (ax + gap + tw <= W ? ax + gap : Math.max(2, ax - tw - gap)) : Math.min(Math.max(ax + r * 1.1, 2), W - tw - 2);
    let ly = beside ? Math.min(Math.max(ay - th / 2, 2), H - th - 2) : ay - r * 1.1 - th < 2 ? ay + r * 1.1 : ay - r * 1.1 - th;
    // If that spot covers the page's text, use the side (right, left, above, below the mark) with the least text under it.
    if (grid && box && inkUnder(grid, lx, ly, tw, th) > 0) {
      const fit = (x: number, y: number) => ({ x: Math.min(Math.max(x, 2), W - tw - 2), y: Math.min(Math.max(y, 2), H - th - 2) });
      const cy = box.y + box.h / 2;
      const options = [fit(box.x + box.w + gap, cy - th / 2), fit(box.x - gap - tw, cy - th / 2), fit(box.x + box.w / 2 - tw / 2, box.y - gap - th), fit(box.x + box.w / 2 - tw / 2, box.y + box.h + gap)];
      const best = options.reduce((a, b) => (inkUnder(grid, b.x, b.y, tw, th) < inkUnder(grid, a.x, a.y, tw, th) ? b : a));
      lx = best.x;
      ly = best.y;
    }
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
        <span className="muted small screen-note">
          {sharing
            ? viewsSeen > 1
              ? `Teacher remembers ${viewsSeen} views of this page, so you don't need to scroll back.`
              : "Scroll through the whole problem once, and Teacher will remember all of it."
            : "Sharing stopped. This is the last snapshot."}
        </span>
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
        <img ref={imgRef} src={shot} alt="Snapshot of your shared screen" onLoad={(e) => buildGrid(e.currentTarget)} />
        <svg viewBox={`0 0 ${W} ${H}`} aria-hidden>
          <defs>
            <marker id="screen-arrow" viewBox="0 0 10 10" refX="8" refY="5" markerWidth="4" markerHeight="4" orient="auto-start-reverse">
              <path d="M0,0 L10,5 L0,10 z" fill="context-stroke" />
            </marker>
          </defs>
          {fitted.map((m, i) => {
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
                  {label(m.text, Math.max(x, x2) + pad, (y + y2) / 2, c, true, { x: bx - pad, y: by - pad, w: Math.max(Math.abs(x2 - x), r) + pad * 2, h: Math.max(Math.abs(y2 - y), r * 0.8) + pad * 2 })}
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
                <ellipse cx={x} cy={y} rx={grid && m.x2 ? Math.max(m.x2 / 2 + W * 0.008, r) : r * 1.6} ry={grid && m.y2 ? Math.max(m.y2 / 2 + W * 0.006, r * 0.7) : r} stroke={c} pathLength={1} />
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
