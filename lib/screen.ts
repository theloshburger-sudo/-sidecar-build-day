// Screen-follow: the student shares a tab or window; each message sends one fresh frame so
// Teacher can see what they see. Frames are never stored.

export function screenShareSupported(): boolean {
  if (typeof navigator === "undefined") return false;
  // Phone browsers don't allow screen capture even when the API exists.
  const mobile = /Android|iPhone|iPad|iPod/i.test(navigator.userAgent) || (navigator.maxTouchPoints > 1 && /Macintosh/.test(navigator.userAgent));
  return !mobile && typeof navigator.mediaDevices?.getDisplayMedia === "function";
}

export async function startScreenShare(video: HTMLVideoElement): Promise<MediaStream> {
  const stream = await navigator.mediaDevices.getDisplayMedia({ video: { frameRate: 5 }, audio: false });
  video.srcObject = stream;
  video.muted = true;
  await video.play().catch(() => {});
  // The first frame can take a moment to arrive.
  if (!video.videoWidth) await Promise.race([new Promise((r) => video.addEventListener("loadeddata", r, { once: true })), new Promise((r) => setTimeout(r, 3000))]);
  if (!video.videoWidth) {
    stopScreenShare(stream);
    throw new Error("no frames from the shared screen");
  }
  return stream;
}

/**
 * The current frame as a JPEG, at most 1456 px wide: about the most detail Claude keeps from an
 * image (larger ones are scaled down on arrival), so small text on a homework page stays readable.
 */
export interface ScreenTile {
  url: string;
  /** The part of the full screenshot this zoom covers, in the full screenshot's pixels. */
  x: number;
  y: number;
  w: number;
  h: number;
}

export interface ScreenFrame {
  url: string;
  w: number;
  h: number;
  /** Zoomed-in quarters for reading small text (only when the real screen has more detail than the full shot). */
  tiles: ScreenTile[];
  /** Earlier views of the same page (page memory), as JPEG data URLs, oldest first. */
  views?: string[];
}

export function captureFrame(video: HTMLVideoElement, maxW = 1456): ScreenFrame | null {
  const w = video.videoWidth;
  const h = video.videoHeight;
  if (!w || !h) return null;
  const scale = Math.min(1, maxW / w);
  const c = document.createElement("canvas");
  c.width = Math.round(w * scale);
  c.height = Math.round(h * scale);
  c.getContext("2d")?.drawImage(video, 0, 0, c.width, c.height);
  return { url: c.toDataURL("image/jpeg", 0.85), w: c.width, h: c.height, tiles: zoomTiles(video, scale) };
}

/**
 * Four overlapping quarters of the real (full-resolution) screen, each sent at up to 1200 px wide:
 * roughly 1.6-2x the detail of the full shot on a laptop/retina screen, so textbook-size text is readable.
 */
function zoomTiles(video: HTMLVideoElement, scale: number): ScreenTile[] {
  const w = video.videoWidth;
  const h = video.videoHeight;
  if (w * scale > w * 0.75) return []; // the full shot already has nearly all the detail there is
  const ov = 0.06; // overlap so words on a seam appear whole in one tile
  const tiles: ScreenTile[] = [];
  for (const [fx, fy] of [[0, 0], [0.5, 0], [0, 0.5], [0.5, 0.5]]) {
    const sx = Math.max(0, (fx - (fx ? ov : 0)) * w);
    const sy = Math.max(0, (fy - (fy ? ov : 0)) * h);
    const sw = Math.min(w - sx, w * (0.5 + ov));
    const sh = Math.min(h - sy, h * (0.5 + ov));
    const ts = Math.min(1, 1200 / sw);
    const c = document.createElement("canvas");
    c.width = Math.round(sw * ts);
    c.height = Math.round(sh * ts);
    c.getContext("2d")?.drawImage(video, sx, sy, sw, sh, 0, 0, c.width, c.height);
    tiles.push({ url: c.toDataURL("image/jpeg", 0.85), x: Math.round(sx * scale), y: Math.round(sy * scale), w: Math.round(sw * scale), h: Math.round(sh * scale) });
  }
  return tiles;
}

export function stopScreenShare(stream: MediaStream | null) {
  stream?.getTracks().forEach((t) => t.stop());
}

/** A tiny grayscale thumbnail of what's on screen, for telling one view from another (scrolling). */
export function viewSignature(video: HTMLVideoElement): Uint8Array | null {
  if (!video.videoWidth) return null;
  const c = document.createElement("canvas");
  c.width = 64;
  c.height = 36;
  const g = c.getContext("2d", { willReadFrequently: true });
  if (!g) return null;
  g.drawImage(video, 0, 0, 64, 36);
  const d = g.getImageData(0, 0, 64, 36).data;
  const out = new Uint8Array(64 * 36);
  for (let i = 0; i < out.length; i++) out[i] = Math.round(0.299 * d[i * 4] + 0.587 * d[i * 4 + 1] + 0.114 * d[i * 4 + 2]);
  return out;
}

/** A readable copy of one view for page memory (a bit smaller than the main shot to keep requests light). */
export function captureView(video: HTMLVideoElement, maxW = 1200): string | null {
  const w = video.videoWidth;
  const h = video.videoHeight;
  if (!w || !h) return null;
  const scale = Math.min(1, maxW / w);
  const c = document.createElement("canvas");
  c.width = Math.round(w * scale);
  c.height = Math.round(h * scale);
  c.getContext("2d")?.drawImage(video, 0, 0, c.width, c.height);
  return c.toDataURL("image/jpeg", 0.8);
}
