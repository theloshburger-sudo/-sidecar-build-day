"use client";

import { forwardRef, memo, useCallback, useEffect, useImperativeHandle, useRef, useState } from "react";
import { BOARD_W, pointAt, toD, type Prim, type Pt } from "@/lib/board";
import { segments } from "@/lib/mathtext";

export interface WhiteboardHandle {
  /** Queue strokes. With `syncMs`, the batch is paced to finish in about that long (to match speech). */
  enqueue(prims: Prim[], syncMs?: number): void;
  /** Skip the rest of the current animation (used when the student interrupts). */
  finishNow(): void;
  reset(): void;
  /** Resolves once everything queued so far has been drawn. */
  whenIdle(): Promise<void>;
  /** The board (with the student's ink) as a JPEG data URL, for Claude to look at. */
  snapshot(): Promise<string | null>;
  clearInk(): void;
}

interface Props {
  height: number;
  speed: number;
  onBusyChange?: (busy: boolean) => void;
  empty?: React.ReactNode;
  /** Student pen mode: pointer draws green ink on the board. */
  penMode?: boolean;
  onInkChange?: (strokes: number) => void;
  /** The beat being spoken right now: its strokes glow so you can see what the words are about. */
  focusBeat?: number | null;
  /** Numbered badges (①②③) next to what each spoken line drew, matching the caption. */
  tags?: { n: number; x: number; y: number; uid: number }[];
}

const INK_COLOR = "#12a150";

const TRAVEL_MS = 150;

function segLengths(paths: Pt[][]): number[] {
  return paths.map((p) => {
    let l = 0;
    for (let i = 1; i < p.length; i++) l += Math.hypot(p[i][0] - p[i - 1][0], p[i][1] - p[i - 1][1]);
    return l;
  });
}

function startOf(p: Prim): Pt {
  if (p.kind === "text") return [p.x, p.y - p.size * 0.35];
  if (p.kind === "path") return p.paths[0]?.[0] ?? [0, 0];
  if (p.kind === "fill") return [p.x, p.y + p.h / 2];
  return [BOARD_W - 80, 60];
}

function tipOf(p: Prim, t: number): Pt {
  if (p.kind === "text") return [p.x + p.w * t, p.y - p.size * 0.35 + Math.sin(t * 38) * p.size * 0.14];
  if (p.kind === "path") return pointAt(p.paths, t);
  if (p.kind === "fill") return [p.x + p.w * t, p.y + p.h / 2];
  // clear: the eraser sweeps back and forth
  return [BOARD_W * (0.15 + 0.7 * Math.abs(Math.sin(t * Math.PI * 1.5))), 80 + t * 300];
}

/** Handwritten text with real raised exponents / lowered subscripts. */
function TextRuns({ text, size }: { text: string; size: number }) {
  const segs = segments(text);
  if (segs.length === 1 && segs[0].k === "n") return <>{text}</>;
  let shift = 0; // current baseline offset, so each run can return to the baseline
  return (
    <>
      {segs.map((s, i) => {
        const target = s.k === "sup" ? -size * 0.42 : s.k === "sub" ? size * 0.22 : 0;
        const dy = target - shift;
        shift = target;
        return (
          <tspan key={i} dy={dy || undefined} fontSize={s.k === "n" ? undefined : size * 0.64}>
            {s.t}
          </tspan>
        );
      })}
    </>
  );
}

function PrimView({ p, t = 1 }: { p: Prim; t?: number }) {
  if (p.kind === "text") {
    const clipId = `clip-${p.key}`;
    return (
      <g>
        {t < 1 && (
          <clipPath id={clipId}>
            <rect x={p.x - 4} y={p.y - p.size * 1.3} width={Math.max(0, p.w * t + 4)} height={p.size * 1.9} />
          </clipPath>
        )}
        <text
          className="wb-text"
          x={p.x}
          y={p.y}
          fontSize={p.size}
          fill={p.color}
          fontWeight={p.bold ? 700 : undefined}
          stroke={p.halo ? "#ffffff" : undefined}
          strokeWidth={p.halo ? 5 : undefined}
          strokeLinejoin="round"
          paintOrder={p.halo ? "stroke" : undefined}
          clipPath={t < 1 ? `url(#${clipId})` : undefined}
        >
          <TextRuns text={p.text} size={p.size} />
        </text>
      </g>
    );
  }
  if (p.kind === "fill") {
    return <rect className="wb-fill" x={p.x} y={p.y} width={Math.max(0, p.w * t)} height={p.h} rx={4} fill={p.color} opacity={p.opacity} />;
  }
  if (p.kind === "path") {
    if (p.dashed) {
      return <path d={toD(p.paths)} stroke={p.color} strokeWidth={p.width} fill="none" strokeDasharray="7 7" strokeLinecap="round" opacity={t} />;
    }
    const lens = segLengths(p.paths);
    const total = lens.reduce((a, b) => a + b, 0) || 1;
    let acc = 0;
    return (
      <g>
        {p.paths.map((seg, i) => {
          const from = acc / total;
          acc += lens[i];
          const to = acc / total;
          const local = t >= 1 ? 1 : Math.max(0, Math.min(1, (t - from) / Math.max(1e-6, to - from)));
          if (local <= 0) return null;
          return (
            <path
              key={i}
              d={toD([seg])}
              pathLength={1}
              stroke={p.color}
              strokeWidth={p.width}
              fill={p.fill ?? "none"}
              fillOpacity={p.fill ? (t >= 1 ? 1 : 0) : undefined}
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeDasharray={local < 1 ? "1 1" : undefined}
              strokeDashoffset={local < 1 ? 1 - local : undefined}
            />
          );
        })}
      </g>
    );
  }
  return null;
}

const DoneLayer = memo(function DoneLayer({ prims, focus }: { prims: Prim[]; focus: number | null }) {
  return (
    <g>
      {prims.map((p) =>
        focus != null && "beat" in p && p.beat === focus ? (
          <g key={p.key} className="wb-focus">
            <PrimView p={p} />
          </g>
        ) : (
          <PrimView key={p.key} p={p} />
        ),
      )}
    </g>
  );
});

function BeatTags({ tags, focus }: { tags: NonNullable<Props["tags"]>; focus: number | null }) {
  return (
    <g className="wb-tags">
      {tags.map((t) => (
        <g key={t.uid} transform={`translate(${t.x} ${t.y})`} className={t.uid === focus ? "wb-tag wb-tag--now" : "wb-tag"}>
          <circle r={13} />
          <text textAnchor="middle" y={5.5}>
            {t.n}
          </text>
        </g>
      ))}
    </g>
  );
}

/** Teacher's glowing stylus, with a mini Teacher riding along. */
function Marker({ tip, erasing }: { tip: Pt; erasing: boolean }) {
  return (
    <g transform={`translate(${tip[0]} ${tip[1]})`} className="wb-marker">
      <g transform="rotate(-38)">
        {erasing ? (
          <g>
            <rect x="-10" y="-60" width="46" height="26" rx="13" fill="#f4f7fb" stroke="#c3cee0" strokeWidth="1.5" />
            <rect x="-4" y="-38" width="34" height="4" rx="2" fill="#4fc3ff" opacity="0.8" />
          </g>
        ) : (
          <g>
            <circle r="6" fill="#4fc3ff" opacity="0.35" />
            <path d="M0 0 L5 -11 L-5 -11 Z" fill="#4fc3ff" />
            <rect x="-7" y="-62" width="14" height="52" rx="7" fill="#f7f9fc" stroke="#c3cee0" strokeWidth="1.5" />
            <rect x="-7" y="-24" width="14" height="3" fill="#4fc3ff" opacity="0.85" />
          </g>
        )}
      </g>
      {/* mini Teacher */}
      <g transform="translate(14 -104) scale(0.5)">
        <ellipse cx="50" cy="34" rx="30" ry="25" fill="#f7f9fc" stroke="#c3cee0" strokeWidth="2.5" />
        <ellipse cx="50" cy="37" rx="23" ry="15" fill="#070a10" />
        <path d="M35 36 q6 3 11 1 M54 37 q5 2 11 -1" stroke="#4fc3ff" strokeWidth="4" fill="none" strokeLinecap="round" />
        <path d="M34 62 C34 56 66 56 66 62 C66 74 58 82 50 84 C42 82 34 74 34 62 Z" fill="#f7f9fc" stroke="#c3cee0" strokeWidth="2.5" />
      </g>
    </g>
  );
}

const Whiteboard = forwardRef<WhiteboardHandle, Props>(function Whiteboard({ height, speed, onBusyChange, empty, penMode = false, onInkChange, focusBeat = null, tags = [] }, ref) {
  const [done, setDone] = useState<Prim[]>([]);
  const [active, setActive] = useState<{ prim: Prim; t: number; tip: Pt } | null>(null);
  const queue = useRef<Prim[]>([]);
  const cur = useRef<{ prim: Prim; start: number; from: Pt } | null>(null);
  const lastTip = useRef<Pt>([BOARD_W - 120, 80]);
  const raf = useRef(0);
  const speedRef = useRef(speed);
  const busyRef = useRef(false);
  const onBusyRef = useRef(onBusyChange);
  const scroller = useRef<HTMLDivElement>(null);
  const syncRef = useRef<number | null>(null);
  const idleWaiters = useRef<(() => void)[]>([]);
  const svgRef = useRef<SVGSVGElement>(null);
  const [ink, setInk] = useState<Pt[][]>([]);
  const drawing = useRef<Pt[] | null>(null);
  const onInkRef = useRef(onInkChange);
  onInkRef.current = onInkChange;
  speedRef.current = speed || 1;
  onBusyRef.current = onBusyChange;

  const setBusy = (b: boolean) => {
    if (busyRef.current !== b) {
      busyRef.current = b;
      onBusyRef.current?.(b);
    }
    if (!b) {
      const w = idleWaiters.current;
      idleWaiters.current = [];
      w.forEach((fn) => fn());
    }
  };

  // ---- student ink ----
  const toBoard = (e: React.PointerEvent): Pt | null => {
    const svg = svgRef.current;
    const m = svg?.getScreenCTM();
    if (!svg || !m) return null;
    const pt = new DOMPoint(e.clientX, e.clientY).matrixTransform(m.inverse());
    return [pt.x, pt.y];
  };
  const onPointerDown = (e: React.PointerEvent<SVGSVGElement>) => {
    if (!penMode) return;
    const p = toBoard(e);
    if (!p) return;
    e.currentTarget.setPointerCapture(e.pointerId);
    drawing.current = [p];
    setInk((s) => [...s, [p]]);
  };
  const onPointerMove = (e: React.PointerEvent<SVGSVGElement>) => {
    if (!penMode || !drawing.current) return;
    const p = toBoard(e);
    if (!p) return;
    const last = drawing.current[drawing.current.length - 1];
    if (Math.hypot(p[0] - last[0], p[1] - last[1]) < 2) return;
    drawing.current.push(p);
    const stroke = [...drawing.current];
    setInk((s) => [...s.slice(0, -1), stroke]);
  };
  const onPointerUp = () => {
    if (!drawing.current) return;
    drawing.current = null;
    setInk((s) => {
      onInkRef.current?.(s.length);
      return s;
    });
  };

  const follow = (tip: Pt) => {
    const el = scroller.current;
    if (!el) return;
    const scale = el.clientWidth / BOARD_W;
    const y = tip[1] * scale;
    if (y > el.scrollTop + el.clientHeight - 90) el.scrollTo({ top: y - el.clientHeight + 140, behavior: "smooth" });
    else if (y < el.scrollTop + 40) el.scrollTo({ top: Math.max(0, y - 120), behavior: "smooth" });
  };

  const tick = useCallback((now: number) => {
    if (!cur.current) {
      const next = queue.current.shift();
      if (!next) {
        setActive(null);
        setBusy(false);
        raf.current = 0;
        return;
      }
      cur.current = { prim: next, start: now + TRAVEL_MS / (syncRef.current ?? speedRef.current), from: lastTip.current };
    }
    const { prim, start, from } = cur.current;
    const spd = syncRef.current ?? speedRef.current;
    if (now < start) {
      // Marker travels to where the next stroke begins.
      const k = 1 - (start - now) / (TRAVEL_MS / spd);
      const to = startOf(prim);
      const ease = k * k * (3 - 2 * k);
      setActive({ prim, t: 0, tip: [from[0] + (to[0] - from[0]) * ease, from[1] + (to[1] - from[1]) * ease] });
    } else {
      const t = Math.min(1, (now - start) / Math.max(1, prim.dur / spd));
      const tip = tipOf(prim, t);
      if (t >= 1) {
        if (prim.kind === "clear") setDone([]);
        else setDone((d) => [...d, prim]);
        lastTip.current = prim.kind === "clear" ? [BOARD_W - 120, 80] : tip;
        cur.current = null;
        setActive(null);
        if (prim.kind === "clear") scroller.current?.scrollTo({ top: 0, behavior: "smooth" });
      } else {
        setActive({ prim, t, tip });
        if (prim.kind !== "clear") follow(tip);
      }
    }
    raf.current = requestAnimationFrame(tick);
  }, []);

  useImperativeHandle(ref, () => ({
    enqueue(prims, syncMs) {
      if (!prims.length) return;
      if (syncMs && syncMs > 0) {
        const natural = prims.reduce((acc, p) => acc + p.dur + TRAVEL_MS, 0);
        syncRef.current = Math.min(3, Math.max(0.35, natural / syncMs));
      } else {
        syncRef.current = null;
      }
      queue.current.push(...prims);
      if (!raf.current) {
        setBusy(true);
        raf.current = requestAnimationFrame(tick);
      }
    },
    finishNow() {
      if (raf.current) cancelAnimationFrame(raf.current);
      raf.current = 0;
      const pending = [...(cur.current ? [cur.current.prim] : []), ...queue.current];
      queue.current = [];
      cur.current = null;
      setActive(null);
      setDone((prev) => {
        let out = [...prev];
        for (const p of pending) out = p.kind === "clear" ? [] : [...out, p];
        return out;
      });
      setBusy(false);
    },
    whenIdle() {
      if (!busyRef.current && !queue.current.length && !cur.current) return Promise.resolve();
      return new Promise<void>((resolve) => idleWaiters.current.push(resolve));
    },
    clearInk() {
      setInk([]);
      onInkRef.current?.(0);
    },
    async snapshot() {
      const svg = svgRef.current;
      if (!svg) return null;
      const clone = svg.cloneNode(true) as SVGSVGElement;
      clone.querySelectorAll(".wb-marker").forEach((n) => n.remove());
      clone.setAttribute("xmlns", "http://www.w3.org/2000/svg");
      clone.setAttribute("width", String(BOARD_W));
      clone.setAttribute("height", String(height));
      clone.removeAttribute("style");
      const bg = document.createElementNS("http://www.w3.org/2000/svg", "rect");
      bg.setAttribute("width", "100%");
      bg.setAttribute("height", "100%");
      bg.setAttribute("fill", "#ffffff");
      clone.insertBefore(bg, clone.firstChild);
      const style = document.createElementNS("http://www.w3.org/2000/svg", "style");
      style.textContent = "text{font-family:'Patrick Hand','Comic Sans MS',cursive}";
      clone.insertBefore(style, clone.firstChild);
      const url = "data:image/svg+xml;charset=utf-8," + encodeURIComponent(new XMLSerializer().serializeToString(clone));
      try {
        const img = await new Promise<HTMLImageElement>((resolve, reject) => {
          const i = new Image();
          i.onload = () => resolve(i);
          i.onerror = reject;
          i.src = url;
        });
        const maxH = 1600;
        const scale = Math.min(1, maxH / height);
        const canvas = document.createElement("canvas");
        canvas.width = Math.round(BOARD_W * scale);
        canvas.height = Math.round(height * scale);
        const ctx = canvas.getContext("2d")!;
        ctx.fillStyle = "#fff";
        ctx.fillRect(0, 0, canvas.width, canvas.height);
        ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
        return canvas.toDataURL("image/jpeg", 0.82);
      } catch {
        return null;
      }
    },
    reset() {
      if (raf.current) cancelAnimationFrame(raf.current);
      raf.current = 0;
      queue.current = [];
      cur.current = null;
      setActive(null);
      setDone([]);
      setBusy(false);
    },
  }), [height]);

  useEffect(() => () => cancelAnimationFrame(raf.current), []);

  const clearing = active?.prim.kind === "clear" ? active.t : 0;
  const isEmpty = !done.length && !active;

  return (
    <div className={`wb-scroller ${penMode ? "wb-scroller--pen" : ""}`} ref={scroller}>
      <svg
        ref={svgRef}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={onPointerUp}
        className="wb-svg"
        style={{ aspectRatio: `${BOARD_W} / ${height}`, touchAction: penMode ? "none" : undefined }} viewBox={`0 0 ${BOARD_W} ${height}`} preserveAspectRatio="xMidYMin meet" role="img" aria-label="Whiteboard">
        <g style={{ opacity: 1 - clearing }}>
          <DoneLayer prims={done} focus={focusBeat} />
        </g>
        {active && active.prim.kind !== "clear" && (
          <g className={focusBeat != null && "beat" in active.prim && active.prim.beat === focusBeat ? "wb-focus" : undefined}>
            <PrimView p={active.prim} t={active.t} />
          </g>
        )}
        <BeatTags tags={tags} focus={focusBeat} />
        <g className="wb-ink">
          {ink.map((st, i) =>
            st.length === 1 ? (
              <circle key={i} cx={st[0][0]} cy={st[0][1]} r={2.6} fill={INK_COLOR} />
            ) : (
              <path key={i} d={toD([st])} stroke={INK_COLOR} strokeWidth={4} fill="none" strokeLinecap="round" strokeLinejoin="round" />
            ),
          )}
        </g>
        {active && <Marker tip={active.tip} erasing={active.prim.kind === "clear"} />}
      </svg>
      {isEmpty && !ink.length && empty && <div className="wb-empty">{empty}</div>}
    </div>
  );
});

export default Whiteboard;
