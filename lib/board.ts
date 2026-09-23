// Whiteboard layout engine.
//
// Claude (or the demo script) sends high-level actions like "write this equation",
// "circle 3x", "plot (x-2)^2". This module turns them into positioned drawing
// primitives (strokes, handwritten text, highlighter fills) that the <Whiteboard>
// component animates one at a time. It is pure and deterministic so it can be
// unit-tested without a browser.

import { compileExpression } from "./expr";
import { caretToUnicode, plainChar } from "./mathtext";
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
  | { kind: "path"; beat?: number; key: string; paths: Pt[][]; color: string; width: number; dashed?: boolean; fill?: string; dur: number }
  | { kind: "text"; beat?: number; key: string; x: number; y: number; text: string; size: number; color: string; w: number; bold?: boolean; halo?: boolean; dur: number }
  | { kind: "fill"; beat?: number; key: string; x: number; y: number; w: number; h: number; color: string; opacity: number; dur: number }
  | { kind: "clear"; key: string; dur: number };

/**
 * Where to put a small numbered badge for something drawn at `bb` without covering any writing:
 * try left, above, right and below it, then fall back to the empty left margin.
 */
export function badgeSpot(state: BoardState, bb: Box, taken: { x: number; y: number }[] = [], r = 13): { x: number; y: number } {
  const blockers: Box[] = [];
  for (const id of state.order) {
    const el = state.els[id];
    if (!el) continue;
    // big containers (graphs, number lines, canvases) are checked through their contents instead
    if (el.kind === "text" || (el.kind === "block" && el.box.w * el.box.h < 60000)) blockers.push(el.box);
  }
  const hits = (x: number, y: number) =>
    x - r < 4 ||
    y - r < 4 ||
    x + r > BOARD_W - 4 ||
    blockers.some((b) => x + r > b.x - 3 && x - r < b.x + b.w + 3 && y + r > b.y - 3 && y - r < b.y + b.h + 3) ||
    taken.some((t) => Math.hypot(t.x - x, t.y - y) < 2 * r + 4);
  const cy = bb.y + Math.min(bb.h / 2, 16);
  const candidates: [number, number][] = [
    [bb.x - r - 6, cy],
    [bb.x + r, bb.y - r - 6],
    [bb.x + bb.w + r + 6, cy],
    [bb.x + r, bb.y + bb.h + r + 6],
    [bb.x - r - 6, bb.y - r - 4],
  ];
  for (const [x, y] of candidates) if (!hits(x, y)) return { x, y };
  // left margin (content starts at x=40), nudged down past other badges
  let y = Math.max(r + 4, cy);
  while (taken.some((t) => Math.abs(t.x - 18) < 4 && Math.abs(t.y - y) < 2 * r + 4)) y += 2 * r + 4;
  return { x: 18, y };
}

/** Bounding box of what a group of primitives draws (ignores clears). */
export function primsBox(prims: Prim[]): Box | null {
  let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
  const take = (x: number, y: number) => {
    x0 = Math.min(x0, x); y0 = Math.min(y0, y); x1 = Math.max(x1, x); y1 = Math.max(y1, y);
  };
  for (const p of prims) {
    if (p.kind === "text") { take(p.x, p.y - p.size); take(p.x + p.w, p.y); }
    else if (p.kind === "fill") { take(p.x, p.y); take(p.x + p.w, p.y + p.h); }
    else if (p.kind === "path") for (const seg of p.paths) for (const [x, y] of seg) take(x, y);
  }
  return Number.isFinite(x0) ? { x: x0, y: y0, w: x1 - x0, h: y1 - y0 } : null;
}

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
      /** A free drawing area: 100×100 units, x to the right, y down. */
      kind: "canvas";
      box: Box;
      unit: number;
      shapes: string[];
      label: string;
    }
  | {
      /** A cause→effect / process chain, or a mind map, that pieces can be added to one at a time. */
      kind: "diagram";
      style: "flow" | "mindmap";
      zone: Zone;
      box: Box;
      slots: Box[];
      used: number;
      center: Box | null;
      color: string;
      items: string[];
      label: string;
    }
  | {
      /** A number line that intervals can be added to, one row at a time. */
      kind: "nline";
      box: Box;
      x0: number;
      x1: number;
      lo: number;
      hi: number;
      axisY: number;
      rowsTop: number;
      rowH: number;
      slots: number;
      rows: string[];
      labelX: number;
      label: string;
    }
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
  /** Small labels already placed (graph/point labels), so new ones can dodge them. */
  labels: Box[];
  seq: number;
}

export type Measure = (text: string, size: number) => number;

/** Rough fallback measure used on the server/tests (handwriting fonts average ~0.5em). */
export const approxMeasure: Measure = (text, size) => text.length * size * 0.5;

export function emptyBoard(): BoardState {
  return { cursor: { left: BOARD_TOP, right: BOARD_TOP }, els: {}, order: [], row: null, lastGraph: null, annot: {}, labels: [], seq: 0 };
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
  const canon = (c: string) => {
    const p = plainChar(c);
    return /[−–—]/.test(p) ? "-" : /[×·]/.test(p) ? "*" : p.toLowerCase();
  };
  const map: number[] = [];
  let flat = "";
  for (let i = 0; i < hay.length; i++) {
    if (/\s/.test(hay[i])) continue;
    flat += canon(hay[i]);
    map.push(i);
  }
  const n = [...caretToUnicode(needle)].filter((c) => !/\s/.test(c)).map(canon).join("");
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
    labels: [...(prev.labels ?? [])],
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

  /** Place a small label near point p, trying spots until it doesn't collide with earlier labels. */
  const placeLabel = (raw: string, p: Pt, color: string, bounds: Box, bold = false) => {
    const label = raw.length > 26 ? `${raw.slice(0, 25)}…` : raw;
    const size = FONT.sm;
    const w = measure(label, size);
    const h = size * 1.1;
    const spots: Pt[] = [
      [p[0] + 10, p[1] - 10],
      [p[0] + 10, p[1] + 26],
      [p[0] - w - 10, p[1] - 10],
      [p[0] - w - 10, p[1] + 26],
      [p[0] + 10, p[1] - 36],
      [p[0] - w / 2, p[1] - 36],
      [p[0] + 10, p[1] + 52],
      [p[0] - w / 2, p[1] + 52],
      [p[0] + 30, p[1] - 62],
      [p[0] + 30, p[1] + 78],
      [p[0] - w - 30, p[1] - 62],
      [p[0] - w - 30, p[1] + 78],
    ];
    const overlap = (b: Box) =>
      s.labels.reduce((acc, o) => acc + Math.max(0, Math.min(b.x + b.w, o.x + o.w) - Math.max(b.x, o.x)) * Math.max(0, Math.min(b.y + b.h, o.y + o.h) - Math.max(b.y, o.y)), 0);
    // First free spot wins; if every spot is crowded, take the least-covered one.
    let best: Box | null = null;
    let bestCost = Infinity;
    for (const [x0, y0] of spots) {
      const x = Math.max(bounds.x, Math.min(x0, bounds.x + bounds.w - w));
      const b = { x, y: y0 - size * 0.85, w, h };
      const cost = overlap(b);
      if (cost < bestCost) {
        best = b;
        bestCost = cost;
      }
      if (cost === 0) break;
    }
    s.labels.push(best!);
    addText(label, best!.x, best!.y + size * 0.85, size, color, bold, true);
  };

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
        s.labels.push({ x, y: hit.line.y - size * 0.85, w, h: size * 1.1 });
        s.annot[hit.key] = x + w + 18;
        return;
      }
    }
    if (!hit.line) {
      placeLabel(label, [hit.box.x + hit.box.w, hit.box.y + 2], color, { x: 20, y: 0, w: BOARD_W - 40, h: 99999 });
      return;
    }
    // No room beside the line: tuck it under the mark and make room below.
    const x = Math.min(Math.max(hit.box.x, 20), right - w);
    let y = hit.box.y + hit.box.h + size + 6;
    // Two marks on one line can both tuck underneath: stack instead of writing over each other.
    const clash = (yy: number) => s.labels.some((o) => x < o.x + o.w && x + w > o.x && yy - size * 0.85 < o.y + o.h && yy + size * 0.25 > o.y);
    for (let tries = 0; tries < 4 && clash(y); tries++) y += size * 1.2;
    addText(label, x, y, size, color, false, true);
    s.labels.push({ x, y: y - size * 0.85, w, h: size * 1.1 });
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

  /** Add one piece to a flow chain (box + arrow from the previous box) or a mind map (branch + box). */
  const addDiagramPiece = (dId: string, raw: string, color: InkColor | undefined) => {
    let d = s.els[dId];
    if (!d || d.kind !== "diagram") return;
    if (d.used >= d.slots.length && d.style === "flow" && d.used < 12) {
      // Grow the chain by one row, as long as nothing has been drawn below it yet.
      const bottom = d.box.y + d.box.h;
      if (Math.abs(topOf(d.zone) - (bottom + GAP)) < 2) {
        const perRow = d.zone === "full" ? 4 : 2;
        const first = d.slots[0];
        const lastRowY = d.slots[d.slots.length - 1].y;
        const extra: Box[] = [];
        for (let c = 0; c < perRow; c++) extra.push({ x: d.slots[c]?.x ?? first.x, y: lastRowY + first.h + 48, w: first.w, h: first.h });
        const grown = { ...d, slots: [...d.slots, ...extra], box: { ...d.box, h: d.box.h + first.h + 48 } };
        s.els[dId] = grown;
        d = grown;
        advance(d.zone, d.box.y + d.box.h);
      }
    }
    if (d.used >= d.slots.length) return;
    const n = d.used + 1;
    const b = d.slots[d.used];
    const c = color ? INK[color] : d.color;
    if (d.style === "flow" && d.used > 0) {
      const prev = d.slots[d.used - 1];
      if (Math.abs(prev.y - b.y) < 2) {
        const p0: Pt = [prev.x + prev.w + 6, prev.y + prev.h / 2];
        const p1: Pt = [b.x - 8, b.y + b.h / 2];
        addPath([handLine(p0, p1, rand, 0.5), ...arrowHead(p1, p0, 11)], INK.ink, 2.6, { dur: 260 });
      } else {
        // wrap to the next row: out of the bottom of the last box, across, into the top of the next
        const p0: Pt = [prev.x + prev.w / 2, prev.y + prev.h + 4];
        const p1: Pt = [b.x + b.w / 2, b.y - 6];
        const curve = quad(p0, [p1[0], p0[1] + (p1[1] - p0[1]) * 0.45], p1, 32);
        addPath([curve, ...arrowHead(p1, curve[curve.length - 3], 11)], INK.ink, 2.6, { dur: 420 });
      }
    }
    if (d.style === "mindmap" && d.center) {
      const cc: Pt = [d.center.x + d.center.w / 2, d.center.y + d.center.h / 2];
      const bc: Pt = [b.x + b.w / 2, b.y + b.h / 2];
      // leave the center ellipse at its edge, stop at the box edge
      const ang = Math.atan2(bc[1] - cc[1], bc[0] - cc[0]);
      const p0: Pt = [cc[0] + Math.cos(ang) * (d.center.w / 2 + 4), cc[1] + Math.sin(ang) * (d.center.h / 2 + 4)];
      const tx = Math.abs(Math.cos(ang)) > 0.35 ? (bc[0] < cc[0] ? b.x + b.w + 4 : b.x - 4) : bc[0];
      const ty = Math.abs(Math.cos(ang)) > 0.35 ? bc[1] : bc[1] < cc[1] ? b.y + b.h + 4 : b.y - 4;
      addPath([handLine(p0, [tx, ty], rand, 0.8)], c, 3, { dur: 260 });
    }
    addPath(rectPath(b, rand), c, 2.6, { dur: 380 });
    let size = FONT.sm;
    let lines = wrap(raw, b.w - 18, size, measure);
    while (size > 14 && lines.length * size * 1.25 > b.h - 12) {
      size -= 1;
      lines = wrap(raw, b.w - 18, size, measure);
    }
    const lh = size * 1.25;
    const startY = b.y + (b.h - lines.length * lh) / 2 + size * 0.95;
    const placed: Line[] = lines.map((l, i) => {
      const w = measure(l.text, size);
      return { text: l.text, start: l.start, x: b.x + (b.w - w) / 2, y: startY + i * lh, size };
    });
    for (const l of placed) addText(l.text, l.x, l.y, size, INK.ink);
    register(`${dId}.${n}`, { kind: "text", text: raw, lines: placed, box: b, label: raw }, "t");
    s.els[dId] = { ...d, used: n, items: [...d.items, raw] };
  };

  /** Add one interval row to a number line: name, bar, guides to the axis, then open/closed endpoints. */
  const drawInterval = (nlId: string, raw: string, color: InkColor | undefined) => {
    const nl = s.els[nlId];
    if (!nl || nl.kind !== "nline") return;
    const iv = parseInterval(raw);
    if (!iv || nl.rows.length >= nl.slots) return;
    const n = nl.rows.length + 1;
    const palette: InkColor[] = ["blue", "orange", "green", "purple", "red"];
    const c = INK[color ?? palette[(n - 1) % palette.length]];
    const X = (v: number) => nl.x0 + ((Math.max(nl.lo, Math.min(nl.hi, v)) - nl.lo) / (nl.hi - nl.lo)) * (nl.x1 - nl.x0);
    const y = nl.rowsTop + (n - 1) * nl.rowH + nl.rowH / 2;
    const a0 = Number.isFinite(iv.lo) ? X(iv.lo) : nl.x0 - 26;
    const a1 = Number.isFinite(iv.hi) ? X(iv.hi) : nl.x1 + 4;
    const name = iv.name || `#${n}`;
    let ns = FONT.sm;
    while (ns > 13 && measure(name, ns) > nl.x0 - nl.labelX - 40) ns -= 1;
    const nameW = addText(name, nl.labelX, y + 7, ns, c, true);
    register(`${nlId}.${n}`, { kind: "text", text: name, lines: [{ text: name, x: nl.labelX, y: y + 7, size: ns, start: 0 }], box: { x: nl.labelX, y: y - 14, w: nameW, h: 24 }, label: raw }, "t");
    const bar: Pt[][] = [handLine([a0, y], [a1, y], rand, 0.4)];
    if (!Number.isFinite(iv.lo)) bar.push(...arrowHead([a0 - 4, y], [a1, y], 11));
    if (!Number.isFinite(iv.hi)) bar.push(...arrowHead([a1 + 4, y], [a0, y], 11));
    addPath(bar, c, 6);
    register(`${nlId}.${n}.bar`, { kind: "block", box: { x: a0, y: y - 8, w: a1 - a0, h: 16 }, children: [], label: `bar ${raw}` }, "t");
    const drops: Pt[][] = [];
    for (const [v, xx] of [[iv.lo, a0], [iv.hi, a1]] as const) if (Number.isFinite(v)) drops.push([[xx, y + 8], [xx, nl.axisY - 2]]);
    if (drops.length) addPath(drops, c, 1.4, { dashed: true, dur: 150 });
    for (const [end, v, xx, closed] of [["lo", iv.lo, a0, iv.loClosed], ["hi", iv.hi, a1, iv.hiClosed]] as const) {
      if (!Number.isFinite(v)) continue;
      const ring: Pt[] = [];
      for (let k = 0; k <= 16; k++) ring.push([xx + Math.cos((k / 16) * Math.PI * 2) * 7.5, y + Math.sin((k / 16) * Math.PI * 2) * 7.5]);
      addPath([ring], c, 3, { fill: closed ? c : "#ffffff", dur: 260 });
      register(`${nlId}.${n}.${end}`, { kind: "block", box: { x: xx - 9, y: y - 9, w: 18, h: 18 }, children: [], label: `${closed ? "closed" : "open"} endpoint at ${fmt(v)}` }, "t");
    }
    s.els[nlId] = { ...nl, rows: [...nl.rows, raw] };
  };

  for (const raw of actions) {
    // x^2 → x² everywhere text is drawn, so it measures and renders as a real exponent.
    const a: BoardAction = {
      ...raw,
      ...(typeof raw.text === "string" ? { text: caretToUnicode(raw.text) } : {}),
      ...(Array.isArray(raw.items) ? { items: raw.items.map((it) => (typeof it === "string" ? caretToUnicode(it) : it)) } : {}),
    };
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
        s.labels = [];
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
        let y = el.box.y + el.box.h + line.size * 0.72;
        const sw = measure(text, line.size);
        if (eq >= 0) {
          const leftC = line.x + measure(line.text.slice(0, eq), line.size) / 2;
          const afterEq = line.x + measure(line.text.slice(0, eq + 1), line.size);
          const rightC = (afterEq + line.x + measure(line.text, line.size)) / 2;
          // Step below any mark labels (e.g. "2nd: + 7") already hanging under the equation.
          const opBox = (cx: number): Box => ({ x: cx - sw / 2, y: y - line.size * 0.8, w: sw, h: line.size });
          for (let tries = 0; tries < 6; tries++) {
            const hit = s.labels.filter((o) => [opBox(leftC), opBox(rightC)].some((b) => b.x < o.x + o.w && b.x + b.w > o.x && b.y < o.y + o.h && b.y + b.h > o.y));
            if (!hit.length) break;
            y = Math.max(...hit.map((o) => o.y + o.h)) + line.size * 0.8 + 4;
          }
          addText(text, leftC - sw / 2, y, line.size, color);
          addText(text, rightC - sw / 2, y, line.size, color);
          s.labels.push(opBox(leftC), opBox(rightC));
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
        // "eq1:]" points at the "]" inside eq1.
        const ref = (r: string | undefined): [string | undefined, string | undefined] => {
          if (!r) return [r, undefined];
          if (s.els[r]) return [r, undefined];
          const i = r.indexOf(":");
          return i > 0 && s.els[r.slice(0, i)] ? [r.slice(0, i), r.slice(i + 1)] : [r, undefined];
        };
        const fromEl = locate(...ref(a.from))?.box;
        const toEl = locate(...ref(a.to))?.box;
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
        } else if (Math.abs(toEl.y + toEl.h / 2 - (fromEl.y + fromEl.h / 2)) > 40) {
          // Mostly a vertical connection (e.g. a bracket up top to a dot on the number line):
          // leave from the bottom/top, run across, then drop onto the target like a teacher's arrow.
          const down = toEl.y > fromEl.y;
          p0 = [fromEl.x + fromEl.w / 2, down ? fromEl.y + fromEl.h + 4 : fromEl.y - 4];
          p1 = [toEl.x + toEl.w / 2, down ? toEl.y - 6 : toEl.y + toEl.h + 6];
          c = [p1[0], p0[1]];
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
        // A long title wraps, so reserve room for every line or the bullets write over it.
        const titleLines = text ? wrap(text, w - pad * 2, FONT.md, measure).length : 0;
        const titleH = titleLines * Math.round(FONT.md * 1.42);
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
          s.labels.push({ x: p[0] - measure(label, tick) / 2, y: p[1] + 18 - tick, w: measure(label, tick), h: tick * 1.1 });
        }
        for (let v = Math.ceil(yMin / gy) * gy; v <= yMax + 1e-9; v += gy) {
          if (Math.abs(v - ay) < 1e-9 && ay !== yMin) continue;
          const p = toPx(g, ax, v);
          const label = fmt(v);
          prims.push({ kind: "text", key: key(), x: p[0] - measure(label, tick) - 7, y: p[1] + 5, text: label, size: tick, color: INK.muted, w: measure(label, tick), dur: 60 });
          s.labels.push({ x: p[0] - measure(label, tick) - 7, y: p[1] + 5 - tick, w: measure(label, tick), h: tick * 1.1 });
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
          placeLabel(text, [Math.min(last[0], g.box.x + g.box.w - 10), Math.max(g.plot.y + 14, Math.min(last[1], g.plot.y + g.plot.h - 6))], color, g.box, true);
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
        s.labels.push({ x: p[0] - 7, y: p[1] - 7, w: 14, h: 14 });
        placeLabel(text || `(${fmt(a.x!)}, ${fmt(a.y!)})`, p, color, g.box);
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
        const all = headers.length ? [headers, ...rows] : rows;
        // Shrink a little, then wrap: long cells get taller rows instead of running into the next column.
        const laid = all.map((row) =>
          row.map((cell) => {
            let size = FONT.sm;
            while (size > 16 && measure(cell, size) > colW - 16) size -= 1;
            return { cell, size, lines: wrap(cell, colW - 16, size, measure) };
          }),
        );
        const heights = laid.map((row) => Math.max(rowH, ...row.map((c) => (c.lines.length - 1) * Math.round(c.size * 1.3) + rowH)));
        const tops: number[] = [top];
        for (const rh of heights) tops.push(tops[tops.length - 1] + rh);
        const h = tops[tops.length - 1] - top;
        const grid: Pt[][] = [];
        for (const y of tops) grid.push(handLine([z.x, y], [z.x + z.w, y], rand, 0.5));
        for (let c = 0; c <= cols; c++) grid.push(handLine([z.x + c * colW, top], [z.x + c * colW, top + h], rand, 0.5));
        addPath(grid, INK.muted, 1.8);
        const tableId = (a.id || "").trim() || `tb${s.seq + 1}`;
        const children: string[] = [];
        laid.forEach((row, r) => {
          row.forEach(({ cell, size, lines }, c) => {
            const x = z.x + c * colW + 8;
            const color = headers.length && r === 0 ? INK.blue : INK.ink;
            const lh = Math.round(size * 1.3);
            const placed: Line[] = lines.map((l, i) => ({ text: l.text, start: l.start, x, y: tops[r] + rowH * 0.68 + i * lh, size }));
            let w = 0;
            for (const l of placed) w = Math.max(w, addText(l.text, l.x, l.y, size, color, headers.length > 0 && r === 0));
            const y0 = placed[0].y;
            const cid = register(`${tableId}.${r}.${c}`, {
              kind: "text",
              text: cell,
              lines: placed,
              box: { x, y: y0 - size, w, h: size * 1.2 + (placed.length - 1) * lh },
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
        // Keep the title between the small "Dr" and "Cr" corner labels.
        let ts = FONT.md;
        while (ts > 18 && measure(title, ts) > w - 60) ts -= 1;
        const tw = measure(title, ts);
        addText(title, x + (w - tw) / 2, top + FONT.md, ts, color, true);
        const barY = top + 44;
        addPath([handLine([x, barY], [x + w, barY], rand), handLine([x + w / 2, barY], [x + w / 2, top + h], rand)], color, 3);
        if (tw <= w - 50) {
          prims.push({ kind: "text", key: key(), x: x + 4, y: barY - 6, text: "Dr", size: 14, color: INK.muted, w: 16, dur: 60 });
          prims.push({ kind: "text", key: key(), x: x + w - 20, y: barY - 6, text: "Cr", size: 14, color: INK.muted, w: 16, dur: 60 });
        }
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

      case "numberLine": {
        const zone = zoneOf(a.zone, "full");
        const z = ZONES[zone];
        const raw = list(a.items).slice(0, 5).map(String);
        const parsed = raw.map(parseInterval);
        const finite = parsed.flatMap((iv) => (iv ? [iv.lo, iv.hi] : [])).filter(Number.isFinite);
        let lo = Number.isFinite(a.xMin) ? a.xMin! : finite.length ? Math.min(...finite, 0) - 1 : -5;
        let hi = Number.isFinite(a.xMax) ? a.xMax! : finite.length ? Math.max(...finite, 0) + 1 : 5;
        if (hi <= lo) [lo, hi] = [lo - 5, lo + 5];
        let top = topOf(zone) + 6;
        if (text) {
          addText(text, z.x, top + FONT.sm, FONT.sm, INK.ink, true);
          top += FONT.sm * 1.6;
        }
        const x0 = z.x + 110;
        const x1 = z.x + z.w - 20;
        const rowH = 40;
        // Reserve room for intervals added later (e.g. the answer row), one per slot.
        const slots = Math.min(5, Math.max(3, raw.length));
        const rowsTop = top + 14;
        const axisY = rowsTop + slots * rowH + 6;
        const X = (v: number) => x0 + ((Math.max(lo, Math.min(hi, v)) - lo) / (hi - lo)) * (x1 - x0);
        const nlId = (a.id || "").trim() || `nl${s.seq + 1}`;
        addPath([handLine([x0 - 30, axisY], [x1 + 8, axisY], rand, 0.5), ...arrowHead([x1 + 12, axisY], [x0, axisY], 11), ...arrowHead([x0 - 34, axisY], [x1, axisY], 11)], INK.ink, 2.6);
        const step = niceStep(hi - lo);
        const ticks: Pt[][] = [];
        for (let v = Math.ceil(lo / step) * step; v <= hi + 1e-9; v += step) {
          ticks.push([[X(v), axisY - 7], [X(v), axisY + 7]]);
          const label = fmt(v);
          const lw = measure(label, 17);
          prims.push({ kind: "text", key: key(), x: X(v) - lw / 2, y: axisY + 28, text: label, size: 17, color: INK.muted, w: lw, dur: 50 });
        }
        addPath(ticks, INK.ink, 2, { dur: 200 });
        const legend = "● included   ○ not included";
        addText(legend, x1 - measure(legend, 16), axisY + 52, 16, INK.muted, false, true);
        const nl: Extract<El, { kind: "nline" }> = {
          kind: "nline",
          box: { x: z.x, y: top, w: z.w, h: axisY + 56 - top },
          x0,
          x1,
          lo,
          hi,
          axisY,
          rowsTop,
          rowH,
          slots,
          rows: [],
          labelX: z.x,
          label: "",
        };
        register(nlId, nl, "nl");
        advance(zone, axisY + 58);
        raw.forEach((r, i) => {
          if (parsed[i]) drawInterval(nlId, r, undefined);
        });
        break;
      }

      case "canvas": {
        const zone = zoneOf(a.zone, "left");
        const z = ZONES[zone];
        let top = topOf(zone) + 6;
        if (text) {
          addText(text, z.x, top + FONT.sm, FONT.sm, INK.ink, true);
          top += FONT.sm * 1.7;
        }
        const side = Math.min(z.w, 380);
        const x0 = zone === "full" ? z.x + (z.w - side) / 2 : z.x;
        const box: Box = { x: x0, y: top + 4, w: side, h: side };
        register(a.id || undefined, { kind: "canvas", box, unit: side / 100, shapes: [], label: text }, "c");
        advance(zone, box.y + box.h + 6);
        break;
      }

      case "sketch": {
        const cid = a.target && s.els[a.target]?.kind === "canvas" ? a.target : [...s.order].reverse().find((id) => s.els[id]?.kind === "canvas");
        const cv = cid ? s.els[cid] : undefined;
        if (!cid || !cv || cv.kind !== "canvas") break;
        const u = cv.unit;
        const num = (v: number | undefined, d: number) => (typeof v === "number" && Number.isFinite(v) ? v : d);
        const P = (x: number, y: number): Pt => [cv.box.x + Math.max(-5, Math.min(105, x)) * u, cv.box.y + Math.max(-5, Math.min(105, y)) * u];
        const color = colorOf(a.color, "ink");
        const kind = String(a.kind || "line");
        const x = num(a.x, 50);
        const y = num(a.y, 50);
        const r = Math.max(0.5, num(a.r, 10));
        let bb: Box | null = null;
        const ring = (cx: number, cy: number, rr: number, n = 40): Pt[] => {
          const pts: Pt[] = [];
          for (let k = 0; k <= n; k++) {
            const t = -Math.PI / 2 + (k / n) * Math.PI * 2;
            const wob = 1 + 0.01 * Math.sin(t * 3 + 0.7);
            pts.push(P(cx + Math.cos(t) * rr * wob, cy + Math.sin(t) * rr * wob));
          }
          return pts;
        };
        if (kind === "circle") {
          addPath([ring(x, y, r, Math.max(48, Math.round(r * u * 0.5)))], color, 3);
          bb = { x: P(x - r, 0)[0], y: P(0, y - r)[1], w: 2 * r * u, h: 2 * r * u };
        } else if (kind === "dot") {
          const rr = Math.max(1.4, Math.min(r, 3));
          addPath([ring(x, y, rr, 16)], color, 3, { fill: color, dur: 200 });
          bb = { x: P(x - rr, 0)[0], y: P(0, y - rr)[1], w: 2 * rr * u, h: 2 * rr * u };
        } else if (kind === "rect") {
          const x2 = num(a.x2, x + 20);
          const y2 = num(a.y2, y + 20);
          const [ax, ay] = P(Math.min(x, x2), Math.min(y, y2));
          const [bx, by] = P(Math.max(x, x2), Math.max(y, y2));
          bb = { x: ax, y: ay, w: bx - ax, h: by - ay };
          addPath(rectPath(bb, rand), color, 3);
        } else if (kind === "line" || kind === "arrow") {
          const p0 = P(x, y);
          const p1 = P(num(a.x2, x + 20), num(a.y2, y));
          addPath([handLine(p0, p1, rand, 0.6), ...(kind === "arrow" ? arrowHead(p1, p0, 12) : [])], color, 3);
          bb = { x: Math.min(p0[0], p1[0]), y: Math.min(p0[1], p1[1]), w: Math.abs(p1[0] - p0[0]) || 4, h: Math.abs(p1[1] - p0[1]) || 4 };
        } else if (kind === "arc") {
          // Clock-style angles: 0° = 12 o'clock, increasing clockwise. Arrowhead at the end.
          const from = num(a.x2, 0);
          let to = num(a.y2, 90);
          if (Math.abs(to - from) < 1) to = from + 90;
          const n = Math.max(8, Math.round(Math.abs(to - from) / 6));
          const pts: Pt[] = [];
          for (let k = 0; k <= n; k++) {
            const deg = from + ((to - from) * k) / n;
            const rad = ((deg - 90) * Math.PI) / 180;
            pts.push(P(x + Math.cos(rad) * r, y + Math.sin(rad) * r));
          }
          addPath([pts, ...arrowHead(pts[pts.length - 1], pts[pts.length - 3], 12)], color, 3);
          const xs = pts.map((p) => p[0]);
          const ys = pts.map((p) => p[1]);
          bb = { x: Math.min(...xs), y: Math.min(...ys), w: Math.max(...xs) - Math.min(...xs) || 4, h: Math.max(...ys) - Math.min(...ys) || 4 };
        } else if (kind === "polygon") {
          const pts = list(a.items)
            .map((it) => String(it).split(/[,\s]+/).map(Number))
            .filter((q) => q.length >= 2 && q.every(Number.isFinite))
            .map((q) => P(q[0], q[1]));
          if (pts.length >= 2) {
            addPath([[...pts, pts[0]]], color, 3);
            const xs = pts.map((p) => p[0]);
            const ys = pts.map((p) => p[1]);
            bb = { x: Math.min(...xs), y: Math.min(...ys), w: Math.max(...xs) - Math.min(...xs), h: Math.max(...ys) - Math.min(...ys) };
          }
        } else if (kind === "text" && text) {
          const size = a.r && a.r >= 3 && a.r <= 12 ? Math.round(a.r * u * 0.9) : FONT.md;
          const w = measure(text, size);
          const [cx, cy] = P(x, y);
          addText(text, cx - w / 2, cy + size * 0.35, size, color);
          bb = { x: cx - w / 2, y: cy - size * 0.7, w, h: size * 1.1 };
          register(a.id || undefined, { kind: "text", text, lines: [{ text, x: cx - w / 2, y: cy + size * 0.35, size, start: 0 }], box: bb, label: text }, "t");
        }
        if (!bb) break;
        if (kind !== "text") {
          if (text) placeLabel(text, [bb.x + bb.w, bb.y + 4], color, { x: cv.box.x - 60, y: cv.box.y - 20, w: cv.box.w + 260, h: cv.box.h + 40 });
          register(a.id || `${cid}.${cv.shapes.length + 1}`, { kind: "block", box: bb, children: [], label: `${kind}${text ? ` "${text}"` : ""}` }, "t");
        }
        s.els[cid] = { ...cv, shapes: [...cv.shapes, `${kind}${text ? ` "${text.slice(0, 20)}"` : ""}`] };
        break;
      }

      case "flow":
      case "mindmap": {
        const zone = zoneOf(a.zone, "full");
        const z = ZONES[zone];
        const items = list(a.items).slice(0, 8).map(String);
        let top = topOf(zone) + 6;
        if (text && a.type === "flow") {
          addText(text, z.x, top + FONT.sm, FONT.sm, INK.ink, true);
          top += FONT.sm * 1.7;
        }
        const color = a.color && a.color !== "ink" ? INK[a.color] : INK.blue;
        const dId = (a.id || "").trim() || `${a.type === "flow" ? "f" : "m"}${s.seq + 1}`;
        const slots: Box[] = [];
        let center: Box | null = null;
        let bottom = top;
        if (a.type === "flow") {
          const perRow = zone === "full" ? 4 : 2;
          const gapX = 46;
          const bw = (z.w - (perRow - 1) * gapX) / perRow;
          const bh = 96;
          const count = Math.min(12, Math.max(perRow, Math.ceil(items.length / perRow) * perRow));
          for (let i = 0; i < count; i++) {
            const r = Math.floor(i / perRow);
            const c = i % perRow;
            slots.push({ x: z.x + c * (bw + gapX), y: top + 6 + r * (bh + 48), w: bw, h: bh });
          }
          bottom = slots[slots.length - 1].y + bh + 8;
        } else {
          const cw = Math.min(260, z.w * 0.4);
          const ch = 70;
          const cx = z.x + z.w / 2;
          const cy = top + 190;
          center = { x: cx - cw / 2, y: cy - ch / 2, w: cw, h: ch };
          const bw = zone === "full" ? 230 : 170;
          const bh = 74;
          const dx = zone === "full" ? z.w / 2 - bw / 2 : z.w / 2 - bw / 2;
          const spots: Pt[] = [
            [cx + dx, cy - 105],
            [cx - dx, cy - 105],
            [cx + dx, cy + 105],
            [cx - dx, cy + 105],
            [cx, cy - 160],
            [cx, cy + 160],
          ];
          for (const [x, y] of spots) slots.push({ x: x - bw / 2, y: y - bh / 2, w: bw, h: bh });
          bottom = cy + 160 + bh / 2 + 10;
          // center bubble
          const ring: Pt[] = [];
          for (let k = 0; k <= 40; k++) {
            const t = (k / 40) * Math.PI * 2 + 0.3;
            ring.push([cx + Math.cos(t) * (cw / 2) * (1 + 0.02 * Math.sin(k)), cy + Math.sin(t) * (ch / 2)]);
          }
          addPath([ring], color, 3.2);
          const label = text || "Main idea";
          let size = FONT.md;
          while (size > 16 && measure(label, size) > cw - 26) size -= 1;
          const lw = measure(label, size);
          addText(label, cx - lw / 2, cy + size * 0.35, size, color, true);
          register(`${dId}.center`, { kind: "text", text: label, lines: [{ text: label, x: cx - lw / 2, y: cy + size * 0.35, size, start: 0 }], box: center, label }, "t");
        }
        register(dId, { kind: "diagram", style: a.type, zone, box: { x: z.x, y: top, w: z.w, h: bottom - top }, slots, used: 0, center, color, items: [], label: text }, a.type === "flow" ? "f" : "m");
        advance(zone, bottom);
        for (const it of items) addDiagramPiece(dId, it, undefined);
        break;
      }

      case "add": {
        // Add the next piece to a number line (an interval), a flow chain (a step) or a mind map (a branch).
        const kinds = ["nline", "diagram"];
        const target = a.target && kinds.includes(s.els[a.target]?.kind ?? "") ? a.target : [...s.order].reverse().find((id) => kinds.includes(s.els[id]?.kind ?? ""));
        if (!target || !text) break;
        const col = a.color && a.color !== "ink" ? a.color : undefined;
        if (s.els[target].kind === "nline") drawInterval(target, text, col);
        else addDiagramPiece(target, text, col);
        break;
      }

      case "interval": {
        const target = a.target && s.els[a.target]?.kind === "nline" ? a.target : [...s.order].reverse().find((id) => s.els[id]?.kind === "nline");
        if (!target || !text) break;
        drawInterval(target, text, a.color && a.color !== "ink" ? a.color : undefined);
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

/** Parse "I: (0, 3]", "[-2, ∞)", "x < 4" style intervals. */
export function parseInterval(src: string): { name: string; lo: number; hi: number; loClosed: boolean; hiClosed: boolean } | null {
  const num = (t: string) => {
    const v = t.trim().toLowerCase().replace(/[−–]/g, "-").replace(/\s/g, "");
    if (/^\+?(∞|inf|infinity)$/.test(v)) return Infinity;
    if (/^-(∞|inf|infinity)$/.test(v)) return -Infinity;
    const n = Number(v);
    return Number.isFinite(n) ? n : NaN;
  };
  const m = /^\s*(?:([^:]{1,20}):\s*)?([([])\s*([^,]+?)\s*,\s*([^)\]]+?)\s*([)\]])\s*$/.exec(src);
  if (m) {
    const lo = num(m[3]);
    const hi = num(m[4]);
    if (Number.isNaN(lo) || Number.isNaN(hi)) return null;
    return { name: (m[1] ?? "").trim(), lo, hi, loClosed: m[2] === "[" && Number.isFinite(lo), hiClosed: m[5] === "]" && Number.isFinite(hi) };
  }
  const ineq = /^\s*(?:([^:]{1,20}):\s*)?[a-z]\s*(<=|>=|≤|≥|<|>)\s*(-?[\d.]+)\s*$/i.exec(src.replace(/[−–]/g, "-"));
  if (ineq) {
    const v = Number(ineq[3]);
    const op = ineq[2];
    const name = (ineq[1] ?? "").trim();
    if (op === "<" || op === "<=" || op === "≤") return { name, lo: -Infinity, hi: v, loClosed: false, hiClosed: op !== "<" };
    return { name, lo: v, hi: Infinity, loClosed: op !== ">", hiClosed: false };
  }
  return null;
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
    else if (el.kind === "canvas")
      lines.push(`- ${id}: drawing area "${el.label}" (100×100, x right, y down); ${el.shapes.length ? el.shapes.map((sh, i) => `${i + 1} ${sh}`).join(", ") : "empty"}`);
    else if (el.kind === "diagram")
      lines.push(
        `- ${id}: ${el.style === "flow" ? "flow chain" : "mind map"} "${el.label}"; ${el.items.map((t, i) => `${i + 1} = ${t.slice(0, 40)}`).join(", ") || "(empty)"}; ${el.slots.length - el.used} free slot(s). Pieces: ${id}.<n>${el.style === "mindmap" ? `, center: ${id}.center` : ""}`,
      );
    else if (el.kind === "nline")
      lines.push(
        `- ${id}: number line ${fmt(el.lo)}..${fmt(el.hi)}; rows ${el.rows.map((r, i) => `${i + 1} = ${r}`).join(", ") || "(none yet)"}; ${el.slots - el.rows.length} free row(s). Endpoints: ${id}.<row>.lo / .hi, bars: ${id}.<row>.bar`,
      );
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
