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

/** The current frame as a JPEG data URL, at most 1280 px wide (enough to read, small to send). */
export function captureFrame(video: HTMLVideoElement, maxW = 1280): string | null {
  const w = video.videoWidth;
  const h = video.videoHeight;
  if (!w || !h) return null;
  const scale = Math.min(1, maxW / w);
  const c = document.createElement("canvas");
  c.width = Math.round(w * scale);
  c.height = Math.round(h * scale);
  c.getContext("2d")?.drawImage(video, 0, 0, c.width, c.height);
  return c.toDataURL("image/jpeg", 0.75);
}

export function stopScreenShare(stream: MediaStream | null) {
  stream?.getTracks().forEach((t) => t.stop());
}
