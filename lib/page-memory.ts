// Page memory for screen sharing: a shared tab only shows what's on screen right now, so while the
// student scrolls, keep one snapshot of each different view. Teacher then sees the whole problem
// (the table they scrolled past) without asking them to scroll back.

/**
 * How different two tiny grayscale thumbnails are: the percent of pixels that changed noticeably.
 * (Not an average: homework pages are mostly white, so averaging hid real scrolls.)
 */
export function signatureDiff(a: Uint8Array, b: Uint8Array): number {
  const n = Math.min(a.length, b.length);
  if (!n) return 100;
  let changed = 0;
  for (let i = 0; i < n; i++) if (Math.abs(a[i] - b[i]) > 8) changed++;
  return (changed / n) * 100;
}

/**
 * Views closer than this (percent of pixels changed) are "the same view". A moving cursor or caret
 * changes well under 1%; scrolling even a sparse homework page changes more.
 */
const SAME_VIEW = 1.5;

export class PageMemory<T> {
  private items: { sig: Uint8Array; data: T }[] = [];
  constructor(private max = 4) {}

  /** Store this view if it's new. `make` only runs (captures) when it is. */
  offer(sig: Uint8Array, make: () => T | null): boolean {
    if (this.items.some((v) => signatureDiff(v.sig, sig) < SAME_VIEW)) return false;
    const data = make();
    if (data === null) return false;
    this.items.push({ sig, data });
    if (this.items.length > this.max) this.items.shift(); // oldest out
    return true;
  }

  views() {
    return [...this.items];
  }

  /** Everything except the view on screen now (which is sent separately, at full detail). */
  others(current: Uint8Array) {
    return this.items.filter((v) => signatureDiff(v.sig, current) >= SAME_VIEW);
  }

  get size() {
    return this.items.length;
  }

  clear() {
    this.items = [];
  }
}
