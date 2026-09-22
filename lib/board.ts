// Whiteboard layout engine.
//
// Claude (or the demo script) sends high-level actions like "write this equation",
// "circle 3x", "plot (x-2)^2". This module turns them into positioned drawing
// primitives (strokes, handwritten text, highlighter fills) that the <Whiteboard>
// component animates one at a time. It is pure and deterministic so it can be
// unit-tested without a browser.

import { compileExpression } from "./expr";
import type { BoardAction, InkColor, TextSize, Zone } from "./types";

export const BOARD_W = 1000;
export const BOARD_TOP = 36;
export const BOARD_MIN_H = 640;

export const INK: Record<InkColor | "muted" | "grid" | "highlight" | "note", string> = {
  ink: "#1f2d3a",
  blue: "#2f6fd6",
  green: "#17936a",
  red: "#e0533d",
  purple: "#7a5af0",
  orange: "#ea8a1f",
  muted: "#8a99a6",
  grid: "#e4ebef",
  highlight: "#ffd84d",
  note: "#fff1a8",
};

const ZONES: Record<Zone, { x: number; w: number }> = {
  left: { x: 40, w: 540 },
  right: { x: 620, w: 340 },
  full: { x: 40, w: 920 },
};

const FONT: Record<TextSize, number> = { sm: 21, md: 30, lg: 40 };
const GAP = 10;

export type Pt = [number, number];

export type Prim =
  | { kind: "path"; key: string; paths: Pt[][]; color: string; width: number; dashed?: boolean; fill?: string; dur: number }
  | { kind: "text"; key: string; x: number; y: number; text: string; size: number; color: string; w: number; bold?: boolean; halo?: boolean; dur: number }
  | { kind: "fill"; key: string; x: number; y: number; w: number; h: number; color: string; opacity: number; dur: number }
  | { kind: "clear"; key: string; dur: number };

interface Line {
  text: string;
  x: number;
  y: number; // baseline
  size: number;
  start: number; // char offset into full text
}

type El =
  | { kind: "text"; text: string; lines: Line[]; box: Box; label: string }
  | { kind: "block"; box: Box; children: string[]; label: string }
  | {
      kind: "graph";
      box: Box;
      plot: Box;
      xMin: number;
      xMax: number;
      yMin: number;
      yMax: number;
      label: string;
    };

export interface Box {
  x: number;
  y: number;
  w: number;
  h: number;
}

export interface BoardState {
  cursor: { left: number; right: number };
  els: Record<string, El>;
  order: string[];
  row: { zone: Zone; x: number; y: number; h: number } | null;
  lastGraph: string | null;
  /** Next free x for mark labels, per text line ("elId#lineIdx"). */
  annot: Record<string, number>;
  seq: number;
}

export type Measure = (text: string, size: number) => number;

/** Rough fallback measure used on the server/tests (handwriting fonts average ~0.5em). */
export const approxMeasure: Measure = (text, size) => text.length * size * 0.5;

export function emptyBoard(): BoardState {
  return { cursor: { left: BOARD_TOP, right: BOARD_TOP }, els: {}, order: [], row: null, lastGraph: null, annot: {}, seq: 0 };
}

export function boardHeight(s: BoardState): number {
  return Math.max(BOARD_MIN_H, Math.max(s.cursor.left, s.cursor.right) + 60);
}

// ---------- helpers ----------

function rng(seed: number) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function pathLength(paths: Pt[][]): number {
  let len = 0;
  for (const p of paths) for (let i = 1; i < p.length; i++) len += Math.hypot(p[i][0] - p[i - 1][0], p[i][1] - p[i - 1][1]);
  return len;
}

/** Straight stroke with a tiny hand wobble. */
function handLine(a: Pt, b: Pt, rand: () => number, wobble = 1.1): Pt[] {
  const len = Math.hypot(b[0] - a[0], b[1] - a[1]);
  const n = Math.max(2, Math.round(len / 18));
  const nx = -(b[1] - a[1]) / (len || 1);
  const ny = (b[0] - a[0]) / (len || 1);
  const phase = rand() * Math.PI * 2;
  const pts: Pt[] = [];
  for (let i = 0; i <= n; i++) {
    const t = i / n;
    const off = i === 0 || i === n ? 0 : Math.sin(t * Math.PI * 2 + phase) * wobble;
    pts.push([a[0] + (b[0] - a[0]) * t + nx * off, a[1] + (b[1] - a[1]) * t + ny * off]);
  }
  return pts;
}

function arrowHead(tip: Pt, from: Pt, size = 13): Pt[][] {
  const ang = Math.atan2(tip[1] - from[1], tip[0] - from[0]);
  const l: Pt = [tip[0] - size * Math.cos(ang - 0.45), tip[1] - size * Math.sin(ang - 0.45)];
  const r: Pt = [tip[0] - size * Math.cos(ang + 0.45), tip[1] - size * Math.sin(ang + 0.45)];
  return [[l, tip, r]];
}

function quad(a: Pt, c: Pt, b: Pt, n = 28): Pt[] {
  const pts: Pt[] = [];
  for (let i = 0; i <= n; i++) {
    const t = i / n;
    const u = 1 - t;
    pts.push([u * u * a[0] + 2 * u * t * c[0] + t * t * b[0], u * u * a[1] + 2 * u * t * c[1] + t * t * b[1]]);
  }
  return pts;
}

function rectPath(b: Box, rand: () => number): Pt[][] {
  const tl: Pt = [b.x, b.y];
  const tr: Pt = [b.x + b.w, b.y];
  const br: Pt = [b.x + b.w, b.y + b.h];
  const bl: Pt = [b.x, b.y + b.h];
  return [[...handLine(tl, tr, rand), ...handLine(tr, br, rand).slice(1), ...handLine(br, bl, rand).slice(1), ...handLine(bl, tl, rand).slice(1)]];
}

function textDur(text: string) {
  return Math.min(1500, Math.max(220, text.length * 34));
}
function pathDur(paths: Pt[][]) {
  return Math.min(1300, Math.max(180, pathLength(paths) * 0.9));
}

function wrap(text: string, maxW: number, size: number, measure: Measure): { text: string; start: number }[] {
  const out: { text: string; start: number }[] = [];
  const hardLines = text.split("\n");
  let offset = 0;
  for (const hard of hardLines) {
    const words = hard.split(/(\s+)/);
    let cur = "";
    let curStart = offset;
    let pos = offset;
    for (const word of words) {
      const next = cur + word;
      if (cur.trim() && measure(next.trimEnd(), size) > maxW && word.trim()) {
        out.push({ text: cur.trimEnd(), start: curStart });
        cur = word;
        curStart = pos;
      } else {
        cur = next;
      }
      pos += word.length;
    }
    out.push({ text: cur.trimEnd(), start: curStart });
    offset += hard.length + 1;
  }
  return out.length ? out : [{ text: "", start: 0 }];
}

const list = (v: unknown): unknown[] => (Array.isArray(v) ? v : []);

/** Case-, dash- and whitespace-insensitive search. Returns [start, end) in the original string. */
export function findLoose(hay: string, needle: string): [number, number] | null {
  const canon = (c: string) => (/[−–—]/.test(c) ? "-" : /[×·]/.test(c) ? "*" : c.toLowerCase());
  const map: number[] = [];
  let flat = "";
  for (let i = 0; i < hay.length; i++) {
    if (/\s/.test(hay[i])) continue;
    flat += canon(hay[i]);
    map.push(i);
  }
  const n = [...needle].filter((c) => !/\s/.test(c)).map(canon).join("");
  if (!n) return null;
  const at = flat.indexOf(n);
  if (at < 0) return null;
  return [map[at], map[at + n.length - 1] + 1];
}

function colorOf(c: InkColor | undefined, fallback: InkColor): string {
  return INK[c && c in INK ? c : fallback];
}

// ---------- the engine ----------

export interface ApplyResult {
  state: BoardState;
  prims: Prim[];
}

export function applyActions(prev: BoardState, actions: BoardAction[], measure: Measure = approxMeasure): ApplyResult {
  // Copy state (shallow is enough; els are replaced, never mutated after insert).
  const s: BoardState = {
    cursor: { ...prev.cursor },
    els: { ...prev.els },
    order: [...prev.order],
    row: prev.row ? { ...prev.row } : null,
    lastGraph: prev.lastGraph,
    annot: { ...(prev.annot ?? {}) },
    seq: prev.seq,
  };
  const prims: Prim[] = [];
  const key = () => `p${++s.seq}`;
  const rand = rng(prev.seq * 7919 + 17);

  const zoneOf = (z: Zone | undefined, fallback: Zone): Zone => (z && z in ZONES ? z : fallback);
  const topOf = (z: Zone) => (z === "full" ? Math.max(s.cursor.left, s.cursor.right) : s.cursor[z]);
  const advance = (z: Zone, bottom: number) => {
    if (z === "full") s.cursor.left = s.cursor.right = bottom + GAP;
    else s.cursor[z] = bottom + GAP;
  };
  const register = (id: string | undefined, el: El, fallbackPrefix: string): string => {
    let name = (id || "").trim() || `${fallbackPrefix}${s.seq + 1}`;
    if (s.els[name] && !id) name = `${name}_${s.seq}`;
    if (!s.els[name]) s.order.push(name);
    s.els[name] = el;
    return name;
  };
  const addText = (text: string, x: number, y: number, size: number, color: string, bold = false, halo = false) => {
    const w = measure(text, size);
    prims.push({ kind: "text", key: key(), x, y, text, size, color, w, bold, halo, dur: textDur(text) });
    return w;
  };
  const addPath = (paths: Pt[][], color: string, width = 3, extra: { dashed?: boolean; fill?: string; dur?: number } = {}) => {
    prims.push({ kind: "path", key: key(), paths, color, width, dashed: extra.dashed, fill: extra.fill, dur: extra.dur ?? pathDur(paths) });
  };

  /** Write (possibly wrapped) text in a zone and register it. */
  const writeBlock = (text: string, zone: Zone, size: TextSize, color: string, top: number, bold = false, xOverride?: number, maxW?: number) => {
    const z = ZONES[zone];
    const px = FONT[size];
    const lh = Math.round(px * 1.42);
    const x = xOverride ?? z.x;
    const lines: Line[] = wrap(text, maxW ?? z.w - (x - z.x), px, measure).map((l, i) => ({
      text: l.text,
      start: l.start,
      x,
      y: top + px * 1.02 + i * lh,
      size: px,
    }));
    let w = 0;
    for (const l of lines) w = Math.max(w, addText(l.text, l.x, l.y, px, color, bold));
    const box: Box = { x, y: top, w, h: lines.length * lh };
    return { lines, box };
  };

  /** Find the rectangle an annotation should wrap (and the text line it sits on, if any). */
  interface Hit {
    box: Box;
    line?: Line;
    key?: string;
  }
  const locate = (target: string | undefined, match: string | undefined): Hit | null => {
    const findIn = (name: string): Hit | null => {
      const el = s.els[name];
      if (!el) return null;
      if (el.kind === "text") {
        if (!match) {
          const li = el.lines.length - 1;
          return { box: el.box, line: el.lines[li], key: `${name}#${li}` };
        }
        const found = findLoose(el.text, match);
        if (!found) return null;
        const [idx, end] = found;
        let li = 0;
        el.lines.forEach((l, i) => {
          if (l.start <= idx) li = i;
        });
        const line = el.lines[li];
        const local = Math.max(0, idx - line.start);
        const len = Math.max(1, Math.min(end - idx, line.text.length - local));
        const x = line.x + measure(line.text.slice(0, local), line.size);
        const w = Math.max(measure(line.text.slice(local, local + len), line.size), line.size * 0.5);
        return { box: { x, y: line.y - line.size * 0.82, w, h: line.size * 1.08 }, line, key: `${name}#${li}` };
      }
      if (el.kind === "block" && match) {
        for (const c of el.children) {
          const b = findIn(c);
          if (b) return b;
        }
        return null;
      }
      return { box: el.box };
    };
    if (target && s.els[target]) {
      const b = findIn(target);
      if (b) return b;
    }
    if (match) {
      for (let i = s.order.length - 1; i >= 0; i--) {
        const b = findIn(s.order[i]);
        if (b && s.els[s.order[i]].kind === "text") return b;
      }
    }
    return null;
  };

  const zoneOfBox = (b: Box): Zone => (b.x >= ZONES.right.x - 5 ? "right" : b.x + b.w > ZONES.left.x + ZONES.left.w + 5 ? "full" : "left");

  /** Put a short label next to a mark without covering other writing. */
  const annotate = (hit: Hit, label: string, color: string) => {
    const size = FONT.sm;
    const w = measure(label, size);
    const zone = zoneOfBox(hit.line ? { x: hit.line.x, y: 0, w: 1, h: 0 } : hit.box);
    const right = zone === "left" ? ZONES.left.x + ZONES.left.w : BOARD_W - 20;
    if (hit.line && hit.key) {
      const lineEnd = hit.line.x + measure(hit.line.text, hit.line.size);
      const x = Math.max(s.annot[hit.key] ?? 0, lineEnd + 26, hit.box.x + hit.box.w + 18);
      if (x + w <= right) {
        addText(label, x, hit.line.y, size, color, false, true);
        s.annot[hit.key] = x + w + 18;
        return;
      }
    }
    // No room beside the line: tuck it under the mark and make room below.
    const x = Math.min(Math.max(hit.box.x, 20), right - w);
    const y = hit.box.y + hit.box.h + size + 6;
    addText(label, x, y, size, color, false, true);
    const bottom = y + size * 0.4;
    if (topOf(zone) < bottom + GAP) advance(zone, bottom);
  };

  const graphOf = (target: string | undefined) => {
    const el = (target && s.els[target]) || (s.lastGraph ? s.els[s.lastGraph] : undefined);
    return el && el.kind === "graph" ? el : null;
  };
  const toPx = (g: Extract<El, { kind: "graph" }>, x: number, y: number): Pt => [
    g.plot.x + ((x - g.xMin) / (g.xMax - g.xMin)) * g.plot.w,
    g.plot.y + g.plot.h - ((y - g.yMin) / (g.yMax - g.yMin)) * g.plot.h,
  ];

  for (const a of actions) {
    if (a.type !== "tAccount") s.row = null;
    const text = (a.text ?? "").toString().slice(0, 400);

    switch (a.type) {
      case "clear": {
        prims.push({ kind: "clear", key: key(), dur: 450 });
        s.cursor = { left: BOARD_TOP, right: BOARD_TOP };
        s.els = {};
        s.order = [];
        s.lastGraph = null;
        s.annot = {};
        break;
      }

      case "write":
      case "askQuestion": {
        if (!text) break;
        const zone = zoneOf(a.zone, a.type === "askQuestion" ? "full" : "left");
        const size = a.size && a.size in FONT ? a.size : "md";
        const color = a.type === "askQuestion" ? colorOf(a.color, "purple") : colorOf(a.color, "ink");
        const shown = text;
        const top = topOf(zone) + (a.type === "askQuestion" ? 8 : 0);
        const { lines, box } = writeBlock(shown, zone, a.type === "askQuestion" ? "md" : size, color, top);
        register(a.id, { kind: "text", text: shown, lines, box, label: shown }, a.type === "askQuestion" ? "q" : "t");
        advance(zone, box.y + box.h);
        break;
      }

      case "balance": {
        const el = a.target ? s.els[a.target] : undefined;
        if (!el || el.kind !== "text" || !text) break;
        const line = el.lines.find((l) => l.text.includes("=")) ?? el.lines[el.lines.length - 1];
        const eq = line.text.indexOf("=");
        const color = colorOf(a.color, "orange");
        const y = el.box.y + el.box.h + line.size * 0.72;
        const sw = measure(text, line.size);
        if (eq >= 0) {
          const leftC = line.x + measure(line.text.slice(0, eq), line.size) / 2;
          const afterEq = line.x + measure(line.text.slice(0, eq + 1), line.size);
          const rightC = (afterEq + line.x + measure(line.text, line.size)) / 2;
          addText(text, leftC - sw / 2, y, line.size, color);
          addText(text, rightC - sw / 2, y, line.size, color);
        } else {
          addText(text, line.x + measure(line.text, line.size) + 16, line.y, line.size, color);
        }
        const zoneKey = zoneOfBox(el.box);
        const bottom = y + line.size * 0.45;
        if (topOf(zoneKey) < bottom + GAP) advance(zoneKey, bottom);
        break;
      }

      case "circle":
      case "underline":
      case "highlight":
      case "strike": {
        const hit = locate(a.target, a.match);
        if (!hit) break;
        const b = hit.box;
        if (a.type === "circle") {
          const cx = b.x + b.w / 2;
          const cy = b.y + b.h / 2;
          const rx = b.w / 2 + 11;
          const ry = b.h / 2 + 7;
          const start = -2.3 + rand() * 0.4;
          const pts: Pt[] = [];
          const steps = 48;
          for (let i = 0; i <= steps; i++) {
            const t = start + (i / steps) * (Math.PI * 2 + 0.45);
            const k = 1 + 0.05 * Math.sin(i * 0.4) + (i / steps) * 0.05;
            pts.push([cx + Math.cos(t) * rx * k, cy + Math.sin(t) * ry * k]);
          }
          addPath([pts], colorOf(a.color, "red"), 3.2);
        } else if (a.type === "underline") {
          addPath([handLine([b.x - 2, b.y + b.h + 5], [b.x + b.w + 4, b.y + b.h + 3], rand, 1.6)], colorOf(a.color, "blue"), 3.4);
        } else if (a.type === "strike") {
          addPath([handLine([b.x - 4, b.y + b.h * 0.62], [b.x + b.w + 4, b.y + b.h * 0.38], rand)], colorOf(a.color, "red"), 3.4);
        } else {
          prims.push({
            kind: "fill",
            key: key(),
            x: b.x - 5,
            y: b.y + 2,
            w: b.w + 10,
            h: b.h - 2,
            color: a.color ? colorOf(a.color, "orange") : INK.highlight,
            opacity: a.color ? 0.25 : 0.55,
            dur: 420,
          });
        }
        if (text) annotate(hit, text, colorOf(a.color, a.type === "underline" ? "blue" : a.type === "highlight" ? "orange" : "red"));
        break;
      }

      case "arrow": {
        const fromEl = locate(a.from, undefined)?.box;
        const toEl = locate(a.to, undefined)?.box;
        if (!fromEl || !toEl) break;
        const color = colorOf(a.color, "blue");
        const overlapX = Math.min(fromEl.x + fromEl.w, toEl.x + toEl.w) - Math.max(fromEl.x, toEl.x) > 0;
        const [upper, lower] = fromEl.y <= toEl.y ? [fromEl, toEl] : [toEl, fromEl];
        const gapTop = upper.y + upper.h;
        const gapBottom = lower.y;
        const colL = Math.min(fromEl.x, toEl.x);
        const colR = Math.max(fromEl.x + fromEl.w, toEl.x + toEl.w);
        // Is anything drawn between two stacked elements?
        const blocked =
          overlapX &&
          s.order.some((id) => {
            if (id.includes(".")) return false;
            const b = s.els[id]?.box;
            return !!b && b !== fromEl && b !== toEl && b.y + b.h > gapTop + 2 && b.y < gapBottom - 2 && b.x < colR && b.x + b.w > colL;
          });

        if (blocked) {
          // Elbow through the empty lane just left of the column, so it never crosses writing.
          const lane = Math.max(14, colL - 20);
          const y0 = fromEl.y + fromEl.h / 2;
          const y1 = toEl.y + toEl.h / 2;
          const p0: Pt = [fromEl.x - 6, y0];
          const p1: Pt = [toEl.x - 6, y1];
          const r = Math.min(12, Math.abs(y1 - y0) / 2);
          const dir = y1 > y0 ? 1 : -1;
          const pts: Pt[] = [
            ...handLine(p0, [lane + r, y0], rand, 0.4),
            ...quad([lane + r, y0], [lane, y0], [lane, y0 + r * dir], 6).slice(1),
            ...handLine([lane, y0 + r * dir], [lane, y1 - r * dir], rand, 0.6).slice(1),
            ...quad([lane, y1 - r * dir], [lane, y1], [lane + r, y1], 6).slice(1),
            ...handLine([lane + r, y1], p1, rand, 0.4).slice(1),
          ];
          addPath([pts, ...arrowHead(p1, [lane, y1], 11)], color, 3);
          if (text) {
            const tw = measure(text, FONT.sm);
            const tx = Math.min(toEl.x + toEl.w + 14, BOARD_W - 12 - tw);
            addText(`← ${text}`, tx, y1 + 7, FONT.sm, color, false, true);
          }
          break;
        }

        let p0: Pt;
        let p1: Pt;
        let c: Pt;
        if (overlapX) {
          const rx = Math.min(colR + 14, BOARD_W - 30);
          p0 = [Math.min(rx, fromEl.x + fromEl.w + 12), fromEl.y + fromEl.h / 2];
          p1 = [Math.min(rx, toEl.x + toEl.w + 12), toEl.y + toEl.h / 2];
          c = [Math.min(rx + 70, BOARD_W - 6), (p0[1] + p1[1]) / 2];
        } else {
          const leftToRight = toEl.x > fromEl.x;
          p0 = [leftToRight ? fromEl.x + fromEl.w + 8 : fromEl.x - 8, fromEl.y + fromEl.h / 2];
          p1 = [leftToRight ? toEl.x - 10 : toEl.x + toEl.w + 10, toEl.y + toEl.h / 2];
          c = [(p0[0] + p1[0]) / 2, Math.min(p0[1], p1[1]) - 50];
        }
        const curve = quad(p0, c, p1);
        addPath([curve, ...arrowHead(p1, curve[curve.length - 3])], color, 3);
        if (text) {
          const mid = curve[Math.floor(curve.length / 2)];
          const tw = measure(text, FONT.sm);
          let tx = overlapX ? mid[0] + 10 : mid[0] - tw / 2;
          if (tx + tw > BOARD_W - 12) tx = overlapX ? mid[0] - tw - 12 : BOARD_W - 12 - tw;
          addText(text, Math.max(12, tx), mid[1] + (overlapX ? 6 : -10), FONT.sm, color, false, true);
        }
        break;
      }

      case "drawLine": {
        const nums = [a.x1, a.y1, a.x2, a.y2];
        if (nums.some((n) => typeof n !== "number" || !Number.isFinite(n))) break;
        const clampX = (v: number) => Math.max(0, Math.min(BOARD_W, v));
        const clampY = (v: number) => Math.max(0, Math.min(boardHeight(s) + 400, v));
        addPath([handLine([clampX(a.x1!), clampY(a.y1!)], [clampX(a.x2!), clampY(a.y2!)], rand)], colorOf(a.color, "ink"), 3);
        break;
      }

      case "divider": {
        const zone = zoneOf(a.zone, "full");
        const z = ZONES[zone];
        const y = topOf(zone) + 12;
        addPath([handLine([z.x, y], [z.x + z.w, y], rand, 0.6)], INK.muted, 2, { dashed: true });
        advance(zone, y + 10);
        break;
      }

      case "box":
      case "note": {
        const zone = zoneOf(a.zone, "left");
        const z = ZONES[zone];
        const isNote = a.type === "note";
        const w = isNote ? Math.min(z.w, 400) : z.w;
        const top = topOf(zone) + 6;
        const pad = 16;
        const color = colorOf(a.color, isNote ? "ink" : "blue");
        // Measure first so the frame can be drawn before the writing.
        const lineH = Math.round(FONT.sm * 1.42);
        const titleH = text ? Math.round(FONT.md * 1.4) : 0;
        const items = list(a.items).slice(0, 12).map((i) => String(i));
        const itemLines = items.map((it) => wrap(`• ${it}`, w - pad * 2, FONT.sm, measure).length);
        const h = pad + titleH + itemLines.reduce((acc, n) => acc + n * lineH, 0) + pad * 0.6;
        const frame: Box = { x: z.x, y: top, w, h };
        if (isNote) {
          prims.push({ kind: "fill", key: key(), x: frame.x, y: frame.y, w, h, color: INK.note, opacity: 0.95, dur: 360 });
        } else {
          addPath(rectPath(frame, rand), color, 2.4);
        }
        const children: string[] = [];
        const boxId = (a.id || "").trim() || `b${s.seq + 1}`;
        let y = top + pad * 0.6;
        if (text) {
          const t = writeBlock(text, zone, "md", color, y, true, z.x + pad, w - pad * 2);
          const cid = register(`${boxId}.title`, { kind: "text", text, lines: t.lines, box: t.box, label: text }, "t");
          children.push(cid);
          y += titleH;
        }
        items.forEach((it, i) => {
          const t = writeBlock(`• ${it}`, zone, "sm", INK.ink, y - 4, false, z.x + pad, w - pad * 2);
          const cid = register(`${boxId}.${i + 1}`, { kind: "text", text: `• ${it}`, lines: t.lines, box: t.box, label: it }, "t");
          children.push(cid);
          y += t.lines.length * lineH;
        });
        register(boxId, { kind: "block", box: frame, children, label: `${isNote ? "note" : "box"} "${text}"` }, "b");
        advance(zone, top + h);
        break;
      }

      case "graph": {
        const zone = zoneOf(a.zone, "right");
        const z = ZONES[zone];
        const w = Math.min(z.w, 520);
        const x0 = zone === "full" ? z.x + (z.w - w) / 2 : z.x;
        let top = topOf(zone) + 6;
        if (text) {
          addText(text, x0, top + FONT.sm, FONT.sm, INK.ink, true);
          top += FONT.sm * 1.6;
        }
        let xMin = Number.isFinite(a.xMin) ? a.xMin! : -10;
        let xMax = Number.isFinite(a.xMax) ? a.xMax! : 10;
        let yMin = Number.isFinite(a.yMin) ? a.yMin! : -10;
        let yMax = Number.isFinite(a.yMax) ? a.yMax! : 10;
        if (xMax <= xMin) [xMin, xMax] = [-10, 10];
        if (yMax <= yMin) [yMin, yMax] = [-10, 10];
        const h = Math.round(w * 0.78);
        const plot: Box = { x: x0 + 34, y: top + 8, w: w - 48, h: h - 50 };
        const g = { kind: "graph" as const, box: { x: x0, y: top, w, h }, plot, xMin, xMax, yMin, yMax, label: "" };
        // grid
        const gx = niceStep(xMax - xMin);
        const gy = niceStep(yMax - yMin);
        const grid: Pt[][] = [];
        for (let v = Math.ceil(xMin / gx) * gx; v <= xMax + 1e-9; v += gx) grid.push([toPx(g, v, yMin), toPx(g, v, yMax)]);
        for (let v = Math.ceil(yMin / gy) * gy; v <= yMax + 1e-9; v += gy) grid.push([toPx(g, xMin, v), toPx(g, xMax, v)]);
        addPath(grid, INK.grid, 1.4, { dur: 300 });
        // axes
        const ax = Math.min(Math.max(0, xMin), xMax);
        const ay = Math.min(Math.max(0, yMin), yMax);
        const xa0 = toPx(g, xMin, ay);
        const xa1 = toPx(g, xMax, ay);
        const ya0 = toPx(g, ax, yMin);
        const ya1 = toPx(g, ax, yMax);
        const xLine = handLine(xa0, [xa1[0] + 10, xa1[1]], rand, 0.8);
        const yLine = handLine(ya0, [ya1[0], ya1[1] - 10], rand, 0.8);
        addPath([xLine, ...arrowHead([xa1[0] + 12, xa1[1]], xa0, 11)], INK.ink, 2.6);
        addPath([yLine, ...arrowHead([ya1[0], ya1[1] - 12], ya0, 11)], INK.ink, 2.6);
        // tick labels
        const tick = 15;
        for (let v = Math.ceil(xMin / gx) * gx; v <= xMax + 1e-9; v += gx) {
          if (Math.abs(v - ax) < 1e-9 && ax !== xMin) continue;
          const p = toPx(g, v, ay);
          const label = fmt(v);
          prims.push({ kind: "text", key: key(), x: p[0] - measure(label, tick) / 2, y: p[1] + 18, text: label, size: tick, color: INK.muted, w: measure(label, tick), dur: 60 });
        }
        for (let v = Math.ceil(yMin / gy) * gy; v <= yMax + 1e-9; v += gy) {
          if (Math.abs(v - ay) < 1e-9 && ay !== yMin) continue;
          const p = toPx(g, ax, v);
          const label = fmt(v);
          prims.push({ kind: "text", key: key(), x: p[0] - measure(label, tick) - 7, y: p[1] + 5, text: label, size: tick, color: INK.muted, w: measure(label, tick), dur: 60 });
        }
        if (a.xLabel) {
          const xl = String(a.xLabel).slice(0, 40);
          const xw = measure(xl, 18);
          if (xa1[0] + 18 + xw <= BOARD_W - 6) addText(xl, xa1[0] + 18, xa1[1] + 6, 18, INK.muted, true, true);
          else addText(xl, Math.max(plot.x, xa1[0] + 12 - xw), xa1[1] + 38, 18, INK.muted, true, true);
        }
        if (a.yLabel) addText(String(a.yLabel).slice(0, 40), ya1[0] + 10, ya1[1] + 6, 18, INK.muted, true, true);
        g.label = `graph x:${fmt(xMin)}..${fmt(xMax)} y:${fmt(yMin)}..${fmt(yMax)}${text ? ` "${text}"` : ""}`;
        const name = register(a.id, g, "g");
        s.lastGraph = name;
        advance(zone, top + h + 8);
        break;
      }

      case "plot": {
        const g = graphOf(a.target);
        if (!g) break;
        const color = colorOf(a.color, "blue");
        const segs: Pt[][] = [];
        if (a.fn) {
          const f = compileExpression(a.fn);
          if (!f) break;
          const pad = (g.yMax - g.yMin) * 0.02;
          let cur: Pt[] = [];
          const N = 220;
          for (let i = 0; i <= N; i++) {
            const x = g.xMin + ((g.xMax - g.xMin) * i) / N;
            const y = f(x);
            if (!Number.isFinite(y) || y < g.yMin - pad || y > g.yMax + pad) {
              if (cur.length > 1) segs.push(cur);
              cur = [];
              continue;
            }
            cur.push(toPx(g, x, y));
          }
          if (cur.length > 1) segs.push(cur);
        } else if (list(a.items).length) {
          const pts = list(a.items)
            .map((it) => String(it).split(/[,\s]+/).map(Number))
            .filter((p) => p.length >= 2 && p.every(Number.isFinite))
            .map((p) => toPx(g, p[0], p[1]));
          if (pts.length > 1) segs.push(pts);
        }
        if (!segs.length) break;
        addPath(segs, color, 3.4);
        if (text) {
          const last = segs[segs.length - 1][segs[segs.length - 1].length - 1];
          const tw = measure(text, FONT.sm);
          const lx = Math.min(last[0] + 6, g.box.x + g.box.w - tw);
          const ly = Math.max(g.plot.y + 14, Math.min(last[1] - 8, g.plot.y + g.plot.h - 6));
          addText(text, lx, ly, FONT.sm, color, true, true);
        }
        break;
      }

      case "point": {
        const g = graphOf(a.target);
        if (!g || !Number.isFinite(a.x) || !Number.isFinite(a.y)) break;
        const p = toPx(g, a.x!, a.y!);
        const color = colorOf(a.color, "red");
        const guide: Pt[][] = [
          [p, toPx(g, a.x!, Math.min(Math.max(0, g.yMin), g.yMax))],
          [p, toPx(g, Math.min(Math.max(0, g.xMin), g.xMax), a.y!)],
        ];
        addPath(guide, INK.muted, 1.6, { dashed: true, dur: 260 });
        const dot: Pt[] = [];
        for (let i = 0; i <= 16; i++) dot.push([p[0] + Math.cos((i / 16) * Math.PI * 2) * 6, p[1] + Math.sin((i / 16) * Math.PI * 2) * 6]);
        addPath([dot], color, 3, { fill: color, dur: 200 });
        const label = text || `(${fmt(a.x!)}, ${fmt(a.y!)})`;
        const tw = measure(label, FONT.sm);
        addText(label, Math.min(p[0] + 10, g.box.x + g.box.w - tw), p[1] - 10, FONT.sm, color, false, true);
        break;
      }

      case "graphArrow": {
        const g = graphOf(a.target);
        const n = [a.x1, a.y1, a.x2, a.y2];
        if (!g || n.some((v) => typeof v !== "number" || !Number.isFinite(v))) break;
        const p0 = toPx(g, a.x1!, a.y1!);
        const p1 = toPx(g, a.x2!, a.y2!);
        const color = colorOf(a.color, "orange");
        addPath([handLine(p0, p1, rand, 0.8), ...arrowHead(p1, p0, 12)], color, 3);
        if (text) addText(text, (p0[0] + p1[0]) / 2 + 8, (p0[1] + p1[1]) / 2 - 8, FONT.sm, color, false, true);
        break;
      }

      case "table": {
        const zone = zoneOf(a.zone, "left");
        const z = ZONES[zone];
        const headers = list(a.headers).slice(0, 6).map(String);
        const rows = list(a.rows).slice(0, 10).map((r) => (Array.isArray(r) ? r.slice(0, 6).map(String) : [String(r)]));
        const cols = Math.max(headers.length, ...rows.map((r) => r.length), 1);
        const colW = z.w / cols;
        const rowH = 38;
        const top = topOf(zone) + 6;
        const nRows = rows.length + (headers.length ? 1 : 0);
        const h = nRows * rowH;
        const grid: Pt[][] = [];
        for (let r = 0; r <= nRows; r++) grid.push(handLine([z.x, top + r * rowH], [z.x + z.w, top + r * rowH], rand, 0.5));
        for (let c = 0; c <= cols; c++) grid.push(handLine([z.x + c * colW, top], [z.x + c * colW, top + h], rand, 0.5));
        addPath(grid, INK.muted, 1.8);
        const tableId = (a.id || "").trim() || `tb${s.seq + 1}`;
        const children: string[] = [];
        const all = headers.length ? [headers, ...rows] : rows;
        all.forEach((row, r) => {
          row.forEach((cell, c) => {
            let size = FONT.sm;
            while (size > 13 && measure(cell, size) > colW - 14) size -= 1;
            const x = z.x + c * colW + 8;
            const y = top + r * rowH + rowH * 0.68;
            const color = headers.length && r === 0 ? INK.blue : INK.ink;
            const w = addText(cell, x, y, size, color, headers.length > 0 && r === 0);
            const cid = register(`${tableId}.${r}.${c}`, {
              kind: "text",
              text: cell,
              lines: [{ text: cell, x, y, size, start: 0 }],
              box: { x, y: y - size, w, h: size * 1.2 },
              label: cell,
            }, "t");
            children.push(cid);
          });
        });
        register(tableId, { kind: "block", box: { x: z.x, y: top, w: z.w, h }, children, label: `table ${headers.join(" | ")}` }, "tb");
        advance(zone, top + h);
        break;
      }

      case "tAccount": {
        const zone = zoneOf(a.zone, "full");
        const z = ZONES[zone];
        const w = Math.min(z.w, 280);
        const debits = list(a.debits).slice(0, 8).map(String);
        const credits = list(a.credits).slice(0, 8).map(String);
        const lineH = 30;
        const h = 58 + Math.max(debits.length, credits.length, 1) * lineH + 10;
        let x: number;
        let top: number;
        if (s.row && s.row.zone === zone && s.row.x + w <= z.x + z.w) {
          x = s.row.x;
          top = s.row.y;
        } else {
          x = z.x;
          top = topOf(zone) + 6;
          s.row = { zone, x, y: top, h: 0 };
        }
        const color = colorOf(a.color, "ink");
        const title = text || "Account";
        const tw = measure(title, FONT.md);
        addText(title, x + (w - tw) / 2, top + FONT.md, FONT.md, color, true);
        const barY = top + 44;
        addPath([handLine([x, barY], [x + w, barY], rand), handLine([x + w / 2, barY], [x + w / 2, top + h], rand)], color, 3);
        prims.push({ kind: "text", key: key(), x: x + 4, y: barY - 6, text: "Dr", size: 14, color: INK.muted, w: 16, dur: 60 });
        prims.push({ kind: "text", key: key(), x: x + w - 20, y: barY - 6, text: "Cr", size: 14, color: INK.muted, w: 16, dur: 60 });
        const acctId = (a.id || "").trim() || `acct${s.seq + 1}`;
        const children: string[] = [];
        const put = (items: string[], side: 0 | 1) =>
          items.forEach((it, i) => {
            let size = FONT.sm;
            while (size > 13 && measure(it, size) > w / 2 - 16) size -= 1;
            const tx = side === 0 ? x + 8 : x + w / 2 + 10;
            const ty = barY + 28 + i * lineH;
            const tw2 = addText(it, tx, ty, size, side === 0 ? INK.green : INK.red);
            const cid = register(`${acctId}.${side === 0 ? "dr" : "cr"}${i + 1}`, {
              kind: "text",
              text: it,
              lines: [{ text: it, x: tx, y: ty, size, start: 0 }],
              box: { x: tx, y: ty - size, w: tw2, h: size * 1.2 },
              label: it,
            }, "t");
            children.push(cid);
          });
        put(debits, 0);
        put(credits, 1);
        register(acctId, { kind: "block", box: { x, y: top, w, h }, children, label: `T-account "${title}"` }, "acct");
        s.row = { zone, x: x + w + 30, y: top, h: Math.max(s.row?.h ?? 0, h) };
        advance(zone, Math.max(top + h, s.row.y + s.row.h));
        break;
      }

      case "timeline": {
        const zone = zoneOf(a.zone, "full");
        const z = ZONES[zone];
        const items = list(a.items).slice(0, 7).map(String);
        if (!items.length) break;
        const top = topOf(zone) + 6;
        let y0 = top;
        if (text) {
          addText(text, z.x, top + FONT.sm, FONT.sm, INK.ink, true);
          y0 += FONT.sm * 1.5;
        }
        const lineY = y0 + 46;
        const color = colorOf(a.color, "blue");
        addPath([handLine([z.x, lineY], [z.x + z.w, lineY], rand, 0.7), ...arrowHead([z.x + z.w + 6, lineY], [z.x, lineY], 12)], color, 3);
        const spacing = z.w / items.length;
        const tlId = (a.id || "").trim() || `tl${s.seq + 1}`;
        const children: string[] = [];
        let maxBottom = lineY + 20;
        items.forEach((it, i) => {
          const cx = z.x + spacing * (i + 0.5);
          const [label, ...rest] = it.split(":");
          const detail = rest.join(":").trim();
          addPath([handLine([cx, lineY - 9], [cx, lineY + 9], rand, 0.3)], color, 3.4, { dur: 120 });
          let ls = FONT.sm;
          while (ls > 13 && measure(label.trim(), ls) > spacing - 8) ls -= 1;
          const lw = measure(label.trim(), ls);
          addText(label.trim(), cx - lw / 2, lineY - 18, ls, color, true);
          if (detail) {
            const dl = wrap(detail, spacing - 12, 17, measure).slice(0, 3);
            dl.forEach((l, j) => {
              const dw = measure(l.text, 17);
              addText(l.text, cx - dw / 2, lineY + 32 + j * 22, 17, INK.ink);
            });
            maxBottom = Math.max(maxBottom, lineY + 32 + (dl.length - 1) * 22 + 8);
          }
          const cid = register(`${tlId}.${i + 1}`, {
            kind: "text",
            text: label.trim(),
            lines: [{ text: label.trim(), x: cx - lw / 2, y: lineY - 18, size: ls, start: 0 }],
            box: { x: cx - lw / 2, y: lineY - 18 - ls, w: lw, h: ls * 1.2 },
            label: it,
          }, "t");
          children.push(cid);
        });
        register(tlId, { kind: "block", box: { x: z.x, y: top, w: z.w, h: maxBottom - top }, children, label: `timeline "${text}"` }, "tl");
        advance(zone, maxBottom);
        break;
      }
    }
  }

  return { state: s, prims };
}

function niceStep(range: number): number {
  const raw = range / 8;
  const mag = Math.pow(10, Math.floor(Math.log10(raw)));
  const n = raw / mag;
  return (n < 1.5 ? 1 : n < 3.5 ? 2 : n < 7.5 ? 5 : 10) * mag;
}

function fmt(v: number): string {
  if (Math.abs(v) < 1e-9) return "0";
  if (Math.abs(v) >= 1000 || Number.isInteger(v)) return String(Math.round(v * 100) / 100);
  return String(Math.round(v * 100) / 100);
}

/** A compact, model-readable description of what's on the board right now. */
export function describeBoard(s: BoardState): string {
  if (!s.order.length) return "(the whiteboard is empty)";
  const lines: string[] = [];
  for (const id of s.order) {
    const el = s.els[id];
    if (!el) continue;
    if (id.includes(".") && !/\.title$/.test(id)) continue; // children are implied by their parent
    if (el.kind === "text") lines.push(`- ${id}: "${el.text.slice(0, 80)}"`);
    else if (el.kind === "graph") lines.push(`- ${id}: ${el.label}`);
    else lines.push(`- ${id}: ${el.label}`);
  }
  const used = Math.max(s.cursor.left, s.cursor.right);
  lines.push(`(board filled down to y=${Math.round(used)}; it scrolls, but use "clear" before a new idea if y > 900)`);
  return lines.slice(-40).join("\n");
}

/** Point along a path primitive at progress t (for the marker tip). */
export function pointAt(paths: Pt[][], t: number): Pt {
  const total = pathLength(paths);
  let target = total * Math.max(0, Math.min(1, t));
  for (const p of paths) {
    for (let i = 1; i < p.length; i++) {
      const seg = Math.hypot(p[i][0] - p[i - 1][0], p[i][1] - p[i - 1][1]);
      if (target <= seg) {
        const k = seg ? target / seg : 0;
        return [p[i - 1][0] + (p[i][0] - p[i - 1][0]) * k, p[i - 1][1] + (p[i][1] - p[i - 1][1]) * k];
      }
      target -= seg;
    }
  }
  const last = paths[paths.length - 1];
  return last ? last[last.length - 1] : [0, 0];
}

export function toD(paths: Pt[][]): string {
  return paths
    .filter((p) => p.length)
    .map((p) => `M${p[0][0].toFixed(1)} ${p[0][1].toFixed(1)}` + p.slice(1).map((q) => `L${q[0].toFixed(1)} ${q[1].toFixed(1)}`).join(""))
    .join(" ");
}
