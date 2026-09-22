"use client";

import { forwardRef, memo, useCallback, useEffect, useImperativeHandle, useRef, useState } from "react";
import { BOARD_W, pointAt, toD, type Prim, type Pt } from "@/lib/board";

export interface WhiteboardHandle {
  enqueue(prims: Prim[]): void;
  /** Skip the rest of the current animation (used when the student interrupts). */
  finishNow(): void;
  reset(): void;
}

interface Props {
  height: number;
  speed: number;
  onBusyChange?: (busy: boolean) => void;
  empty?: React.ReactNode;
}

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
          {p.text}
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

const DoneLayer = memo(function DoneLayer({ prims }: { prims: Prim[] }) {
  return (
    <g>
      {prims.map((p) => (
        <PrimView key={p.key} p={p} />
      ))}
    </g>
  );
});

/** The little marker Teacher draws with, with a tiny cloud riding on the cap. */
function Marker({ tip, erasing }: { tip: Pt; erasing: boolean }) {
  return (
    <g transform={`translate(${tip[0]} ${tip[1]})`} className="wb-marker">
      <g transform="rotate(-38)">
        {erasing ? (
          <g>
            <rect x="-10" y="-60" width="46" height="26" rx="6" fill="#8fa3c2" />
            <rect x="-10" y="-40" width="46" height="10" rx="3" fill="#e9eef7" />
          </g>
        ) : (
          <g>
            <path d="M0 0 L7 -12 L-7 -12 Z" fill="#2f5bd3" />
            <rect x="-9" y="-62" width="18" height="50" rx="4" fill="#2f5bd3" />
            <rect x="-9" y="-38" width="18" height="8" fill="#ffffff" opacity="0.7" />
            <rect x="-10" y="-74" width="20" height="15" rx="4" fill="#1d3f9e" />
          </g>
        )}
      </g>
      {/* mini Teacher */}
      <g transform="translate(18 -92) scale(0.42)">
        <path d="M28 80h66a22 22 0 0 0 3-43.8A30 30 0 0 0 40.6 27 21 21 0 0 0 28 80z" fill="#fff" stroke="#b9cbee" strokeWidth="4" />
        <ellipse cx="49" cy="54" rx="4" ry="5" fill="#1f2d3a" />
        <ellipse cx="75" cy="54" rx="4" ry="5" fill="#1f2d3a" />
        <path d="M55 64q7 6 14 0" stroke="#1f2d3a" strokeWidth="3.5" fill="none" strokeLinecap="round" />
      </g>
    </g>
  );
}

const Whiteboard = forwardRef<WhiteboardHandle, Props>(function Whiteboard({ height, speed, onBusyChange, empty }, ref) {
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
  speedRef.current = speed;
  onBusyRef.current = onBusyChange;

  const setBusy = (b: boolean) => {
    if (busyRef.current !== b) {
      busyRef.current = b;
      onBusyRef.current?.(b);
    }
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
      cur.current = { prim: next, start: now + TRAVEL_MS / speedRef.current, from: lastTip.current };
    }
    const { prim, start, from } = cur.current;
    const spd = speedRef.current;
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
    enqueue(prims) {
      if (!prims.length) return;
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
    reset() {
      if (raf.current) cancelAnimationFrame(raf.current);
      raf.current = 0;
      queue.current = [];
      cur.current = null;
      setActive(null);
      setDone([]);
      setBusy(false);
    },
  }));

  useEffect(() => () => cancelAnimationFrame(raf.current), []);

  const clearing = active?.prim.kind === "clear" ? active.t : 0;
  const isEmpty = !done.length && !active;

  return (
    <div className="wb-scroller" ref={scroller}>
      <svg className="wb-svg" style={{ aspectRatio: `${BOARD_W} / ${height}` }} viewBox={`0 0 ${BOARD_W} ${height}`} preserveAspectRatio="xMidYMin meet" role="img" aria-label="Whiteboard">
        <g style={{ opacity: 1 - clearing }}>
          <DoneLayer prims={done} />
        </g>
        {active && active.prim.kind !== "clear" && <PrimView p={active.prim} t={active.t} />}
        {active && <Marker tip={active.tip} erasing={active.prim.kind === "clear"} />}
      </svg>
      {isEmpty && empty && <div className="wb-empty">{empty}</div>}
    </div>
  );
});

export default Whiteboard;
