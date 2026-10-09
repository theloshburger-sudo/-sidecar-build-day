// Teacher aims a box at something on the student's screen; this fits the box to the real content
// underneath (a number, a word, an input box) using the snapshot's pixels, so a slightly-off aim
// still lands exactly on the thing.

/** One cell per `cell` screenshot pixels; 1 = the cell has text, lines or color. */
export interface Grid {
  cols: number;
  rows: number;
  cell: number;
  ink: Uint8Array;
}

/**
 * From the full-resolution snapshot pixels: a cell has content if its darkest pixel is dark
 * (text, thin field borders) or clearly colored (links, highlights). Light zebra stripes don't count.
 */
export function gridFromImage(rgba: Uint8ClampedArray, width: number, height: number, cell: number): Grid {
  const cols = Math.ceil(width / cell);
  const rows = Math.ceil(height / cell);
  const ink = new Uint8Array(cols * rows);
  for (let y = 0; y < height; y++) {
    const row = Math.floor(y / cell) * cols;
    for (let x = 0; x < width; x++) {
      const i = (y * width + x) * 4;
      const r = rgba[i], g = rgba[i + 1], b = rgba[i + 2];
      if (0.299 * r + 0.587 * g + 0.114 * b < 215 || Math.max(r, g, b) - Math.min(r, g, b) > 60) ink[row + Math.floor(x / cell)] = 1;
    }
  }
  return { cols, rows, cell, ink };
}

export interface Box {
  x1: number;
  y1: number;
  x2: number;
  y2: number;
}

interface CellRect {
  c0: number;
  r0: number;
  c1: number;
  r1: number;
}

const hit = (a: CellRect, b: CellRect) => a.c0 <= b.c1 && b.c0 <= a.c1 && a.r0 <= b.r1 && b.r0 <= a.r1;
const area = (a: CellRect) => (a.c1 - a.c0 + 1) * (a.r1 - a.r0 + 1);

/** Returns the box fitted to the content it was aimed at, or the same box if there's nothing sensible to fit. */
export function snapBox(g: Grid, box: Box): Box {
  const aim: CellRect = {
    c0: Math.max(0, Math.floor(Math.min(box.x1, box.x2) / g.cell)),
    r0: Math.max(0, Math.floor(Math.min(box.y1, box.y2) / g.cell)),
    c1: Math.min(g.cols - 1, Math.floor(Math.max(box.x1, box.x2) / g.cell)),
    r1: Math.min(g.rows - 1, Math.floor(Math.max(box.y1, box.y2) / g.cell)),
  };
  if (aim.c1 < aim.c0 || aim.r1 < aim.r0) return box;
  // Look a little beyond the aim: the model is usually close, not exact.
  const mc = Math.max(4, Math.round((aim.c1 - aim.c0 + 1) * 0.3));
  const mr = Math.max(4, Math.round((aim.r1 - aim.r0 + 1) * 0.3));
  const reg: CellRect = { c0: Math.max(0, aim.c0 - mc), r0: Math.max(0, aim.r0 - mr), c1: Math.min(g.cols - 1, aim.c1 + mc), r1: Math.min(g.rows - 1, aim.r1 + mr) };
  // Pieces start inside `reg` but may be followed further, so a word isn't cut off at the search edge.
  const oc = Math.max(12, aim.c1 - aim.c0 + 1);
  const or = Math.max(6, aim.r1 - aim.r0 + 1);
  const outer: CellRect = { c0: Math.max(0, aim.c0 - oc), r0: Math.max(0, aim.r0 - or), c1: Math.min(g.cols - 1, aim.c1 + oc), r1: Math.min(g.rows - 1, aim.r1 + or) };

  // Connected pieces of content inside the region. Letters a cell apart join into words;
  // a blank row separates lines, a wider gap separates words.
  const seen = new Uint8Array(g.cols * g.rows);
  const parts: CellRect[] = [];
  for (let r = reg.r0; r <= reg.r1; r++) {
    for (let c = reg.c0; c <= reg.c1; c++) {
      const i = r * g.cols + c;
      if (!g.ink[i] || seen[i]) continue;
      const part = { c0: c, r0: r, c1: c, r1: r };
      const stack = [i];
      seen[i] = 1;
      while (stack.length) {
        const j = stack.pop()!;
        const y = Math.floor(j / g.cols), x = j % g.cols;
        part.c0 = Math.min(part.c0, x); part.c1 = Math.max(part.c1, x);
        part.r0 = Math.min(part.r0, y); part.r1 = Math.max(part.r1, y);
        for (let dy = -1; dy <= 1; dy++) {
          for (let dx = -2; dx <= 2; dx++) {
            const nx = x + dx, ny = y + dy;
            if (nx < outer.c0 || nx > outer.c1 || ny < outer.r0 || ny > outer.r1) continue;
            const k = ny * g.cols + nx;
            if (g.ink[k] && !seen[k]) {
              seen[k] = 1;
              stack.push(k);
            }
          }
        }
      }
      parts.push(part);
    }
  }
  // Only what the aim mostly covers: grazing the next line or the edge of a neighbouring word doesn't count.
  const overlap = (p: CellRect) => Math.max(0, Math.min(p.c1, aim.c1) - Math.max(p.c0, aim.c0) + 1) * Math.max(0, Math.min(p.r1, aim.r1) - Math.max(p.r0, aim.r0) + 1);
  const frac = (p: CellRect) => overlap(p) / area(p);
  let aimed = parts.filter((p) => hit(p, aim) && frac(p) >= 0.55);
  if (!aimed.length) {
    // Aimed a bit off (e.g. too far left): the best-covered piece, if the aim covers a fair part of it.
    const near = parts.filter((p) => hit(p, aim));
    const best = near.length ? near.reduce((a, b) => (frac(b) > frac(a) ? b : a)) : null;
    aimed = best && frac(best) >= 0.25 ? [best] : [];
  }
  if (!aimed.length) return box;
  const limit = 4 * Math.max(area(aim), 16);
  const union = aimed.reduce((u, p) => ({ c0: Math.min(u.c0, p.c0), r0: Math.min(u.r0, p.r0), c1: Math.max(u.c1, p.c1), r1: Math.max(u.r1, p.r1) }));
  let fit: CellRect | null = area(union) <= limit ? union : null;
  if (!fit) {
    // Too big together (e.g. touching a paragraph): take the one piece that overlaps the aim most.
    const best = aimed.reduce((a, b) => (overlap(b) > overlap(a) ? b : a));
    fit = area(best) <= limit ? best : null;
  }
  if (!fit) return box;
  return { x1: fit.c0 * g.cell, y1: fit.r0 * g.cell, x2: (fit.c1 + 1) * g.cell, y2: (fit.r1 + 1) * g.cell };
}

/** How many content cells a rectangle (in screenshot pixels) covers. */
export function inkUnder(g: Grid, x: number, y: number, w: number, h: number): number {
  const c0 = Math.max(0, Math.floor(x / g.cell));
  const c1 = Math.min(g.cols - 1, Math.floor((x + w) / g.cell));
  const r0 = Math.max(0, Math.floor(y / g.cell));
  const r1 = Math.min(g.rows - 1, Math.floor((y + h) / g.cell));
  let n = 0;
  for (let r = r0; r <= r1; r++) for (let c = c0; c <= c1; c++) n += g.ink[r * g.cols + c];
  return n;
}
