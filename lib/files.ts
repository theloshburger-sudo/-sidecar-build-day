// Client-side file reading: PDF text extraction (pdf.js), scanned-PDF rendering, and photo downscaling.

export const MAX_FILE_MB = 20;

export interface ReadResult {
  text: string;
  images: string[]; // data URLs to send for vision OCR when there's no text layer
  pages: number;
}

export class FileProblem extends Error {}

export async function readAssignmentFile(file: File, onStatus: (s: string) => void): Promise<ReadResult> {
  if (file.size > MAX_FILE_MB * 1024 * 1024) throw new FileProblem(`That file is over ${MAX_FILE_MB} MB. Try a smaller export or a photo of just the page you need.`);
  const name = file.name.toLowerCase();
  if (file.type === "application/pdf" || name.endsWith(".pdf")) return readPdf(file, onStatus);
  if (file.type.startsWith("image/") || /\.(png|jpe?g|webp|gif|heic)$/.test(name)) {
    if (/heic/.test(file.type) || name.endsWith(".heic")) {
      throw new FileProblem("HEIC photos can't be read in the browser. On iPhone, share the photo as JPG (or take a screenshot of it) and upload that.");
    }
    onStatus("Preparing your photo…");
    return { text: "", images: [await downscaleImage(file)], pages: 1 };
  }
  if (file.type.startsWith("text/") || /\.(txt|md)$/.test(name)) {
    const text = await file.text();
    return { text, images: [], pages: 1 };
  }
  throw new FileProblem("That file type isn't supported. Upload a PDF, a photo (JPG/PNG), or paste the problem text.");
}

async function readPdf(file: File, onStatus: (s: string) => void): Promise<ReadResult> {
  onStatus("Opening PDF…");
  const pdfjs = await import("pdfjs-dist");
  pdfjs.GlobalWorkerOptions.workerSrc = "/pdf.worker.min.mjs";
  let doc;
  try {
    doc = await pdfjs.getDocument({ data: new Uint8Array(await file.arrayBuffer()) }).promise;
  } catch (e) {
    const msg = String((e as Error)?.message ?? e);
    if (/password/i.test(msg)) throw new FileProblem("That PDF is password-protected. Remove the password (or print it to a new PDF) and try again.");
    throw new FileProblem("That PDF looks damaged or isn't a real PDF. Try downloading it again, or upload a screenshot.");
  }
  const pages = Math.min(doc.numPages, 25);
  let text = "";
  for (let i = 1; i <= pages; i++) {
    onStatus(`Reading page ${i} of ${pages}…`);
    const page = await doc.getPage(i);
    const content = await page.getTextContent();
    let lastY: number | null = null;
    for (const item of content.items as { str?: string; transform?: number[]; hasEOL?: boolean }[]) {
      if (typeof item.str !== "string") continue;
      const y = item.transform?.[5] ?? null;
      if (lastY !== null && y !== null && Math.abs(y - lastY) > 2) text += "\n";
      text += item.str;
      if (item.hasEOL) text += "\n";
      lastY = y;
    }
    text += "\n\n";
  }
  text = text.replace(/[ \t]+/g, " ").replace(/\n{3,}/g, "\n\n").trim();

  // Scanned PDF (no text layer): render the first pages to images for vision OCR.
  if (text.replace(/\s/g, "").length < 40) {
    const images: string[] = [];
    const n = Math.min(pages, 3);
    for (let i = 1; i <= n; i++) {
      onStatus(`Scanning page ${i} of ${n}…`);
      const page = await doc.getPage(i);
      const base = page.getViewport({ scale: 1 });
      const scale = Math.min(2, 1400 / base.width);
      const vp = page.getViewport({ scale });
      const canvas = document.createElement("canvas");
      canvas.width = Math.round(vp.width);
      canvas.height = Math.round(vp.height);
      const ctx = canvas.getContext("2d")!;
      await page.render({ canvasContext: ctx, viewport: vp }).promise;
      images.push(canvas.toDataURL("image/jpeg", 0.82));
    }
    return { text: "", images, pages };
  }
  return { text, images: [], pages };
}

async function downscaleImage(file: File, max = 1600): Promise<string> {
  const url = URL.createObjectURL(file);
  try {
    const img = await new Promise<HTMLImageElement>((resolve, reject) => {
      const el = new Image();
      el.onload = () => resolve(el);
      el.onerror = () => reject(new FileProblem("We couldn't open that image. Try a JPG or PNG."));
      el.src = url;
    });
    const scale = Math.min(1, max / Math.max(img.width, img.height));
    const canvas = document.createElement("canvas");
    canvas.width = Math.round(img.width * scale);
    canvas.height = Math.round(img.height * scale);
    const ctx = canvas.getContext("2d")!;
    ctx.fillStyle = "#fff";
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
    return canvas.toDataURL("image/jpeg", 0.85);
  } finally {
    URL.revokeObjectURL(url);
  }
}
