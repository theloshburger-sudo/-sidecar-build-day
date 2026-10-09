// Where to put Teacher's labels and notes on a shared-screen snapshot: in blank space, beside
// the thing they talk about, never over text and never on top of each other.

export interface Rect {
  x: number;
  y: number;
  w: number;
  h: number;
}

/** One cell per `cell` image pixels; ink = the cell has text, lines or color in it. */
export interface InkMap {
  cols: number;
  rows: number;
  cell: number;
  ink: Uint8Array;
}

/**
 * From the snapshot drawn at 1/cell scale (so each pixel is the average of a cell): a near-white
 * average means blank page; anything darker or colored has content.
 */
export function inkMapFromPixels(rgba: Uint8ClampedArray, cols: number, rows: number, cell: number): InkMap {
  const ink = new Uint8Array(cols * rows);
  for (let i = 0; i < cols * rows; i++) {
    const r = rgba[i * 4], g = rgba[i * 4 + 1], b = rgba[i * 4 + 2];
    const lum = 0.299 * r + 0.587 * g + 0.114 * b;
    ink[i] = lum < 236 || Math.max(r, g, b) - Math.min(r, g, b) > 50 ? 1 : 0;
  }
  return { cols, rows, cell, ink };
}

/** How many content cells a rectangle covers. */
export function inkIn(map: InkMap, r: Rect): number {
  const c0 = Math.max(0, Math.floor(r.x / map.cell));
  const c1 = Math.min(map.cols - 1, Math.ceil((r.x + r.w) / map.cell) - 1);
  const r0 = Math.max(0, Math.floor(r.y / map.cell));
  const r1 = Math.min(map.rows - 1, Math.ceil((r.y + r.h) / map.cell) - 1);
  let n = 0;
  for (let y = r0; y <= r1; y++) for (let x = c0; x <= c1; x++) n += map.ink[y * map.cols + x];
  return n;
}

export const overlaps = (a: Rect, b: Rect) => a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h;

/**
 * The best spot for a box of `size` near `anchor`: try right, left, above, below, then rings further
 * out. Text under the box, other labels and distance all cost; spots outside the image are skipped.
 */
export function placeBox(map: InkMap | null, anchor: Rect, size: { w: number; h: number }, taken: Rect[], bounds: { w: number; h: number }): Rect {
  const gap = Math.max(4, map?.cell ?? 6);
  const cx = anchor.x + anchor.w / 2;
  const cy = anchor.y + anchor.h / 2;
  const seeds: [number, number][] = [
    [anchor.x + anchor.w + gap, cy - size.h / 2], // right
    [anchor.x - gap - size.w, cy - size.h / 2], // left
    [cx - size.w / 2, anchor.y - gap - size.h], // above
    [cx - size.w / 2, anchor.y + anchor.h + gap], // below
    [anchor.x + anchor.w + gap, anchor.y - gap - size.h], // above-right
    [anchor.x + anchor.w + gap, anchor.y + anchor.h + gap], // below-right
  ];
  const step = gap * 1.5;
  // Rings further out, in case everything close is text.
  for (let ring = 1; ring <= 12; ring++) {
    const d = ring * step;
    for (const [sx, sy] of seeds.slice(0, 4)) {
      seeds.push([sx + d, sy], [sx - d, sy], [sx, sy + d], [sx, sy - d]);
    }
  }
  let best: Rect | null = null;
  let bestScore = Infinity;
  for (const [sx, sy] of seeds) {
    const r = { x: sx, y: sy, w: size.w, h: size.h };
    if (r.x < 0 || r.y < 0 || r.x + r.w > bounds.w || r.y + r.h > bounds.h) continue;
    if (overlaps(r, anchor)) continue;
    const clash = taken.filter((t) => overlaps(t, r)).length;
    const dist = Math.hypot(r.x + r.w / 2 - cx, r.y + r.h / 2 - cy);
    const score = clash * 1e6 + (map ? inkIn(map, r) : 0) * 400 + dist;
    if (score < bestScore) {
      bestScore = score;
      best = r;
    }
  }
  // Nothing fits inside (tiny image): pin it inside the edges rather than cut it off.
  return (
    best ?? {
      x: Math.min(Math.max(0, anchor.x + anchor.w + gap), Math.max(0, bounds.w - size.w)),
      y: Math.min(Math.max(0, cy - size.h / 2), Math.max(0, bounds.h - size.h)),
      w: size.w,
      h: size.h,
    }
  );
}

interface MarkLike {
  kind?: string;
  x?: number;
  y?: number;
  x2?: number;
  y2?: number;
  text?: string;
}

/** The model sometimes marks the same thing twice: same kind and text, nearly the same place. */
export function sameMark(a: MarkLike, b: MarkLike): boolean {
  if (a.kind !== b.kind || (a.text ?? "").trim().toLowerCase() !== (b.text ?? "").trim().toLowerCase()) return false;
  const ca = [((a.x ?? 0) + (a.x2 || a.x || 0)) / 2, ((a.y ?? 0) + (a.y2 || a.y || 0)) / 2];
  const cb = [((b.x ?? 0) + (b.x2 || b.x || 0)) / 2, ((b.y ?? 0) + (b.y2 || b.y || 0)) / 2];
  return Math.hypot(ca[0] - cb[0], ca[1] - cb[1]) < 30;
}

/** Word-wrap a note into lines of at most `max` characters. */
export function wrapNote(text: string, max: number): string[] {
  const lines: string[] = [];
  let line = "";
  for (const word of text.trim().split(/\s+/)) {
    if (line && (line + " " + word).length > max) {
      lines.push(line);
      line = word;
    } else line = line ? `${line} ${word}` : word;
  }
  if (line) lines.push(line);
  return lines.slice(0, 5);
}
