import { NextResponse } from "next/server";
import { MODEL, createJSON, friendlyError, hasKey, rateLimited } from "@/lib/server/claude";
import { EXTRACT_SYSTEM } from "@/lib/prompt";
import { extractSchema } from "@/lib/schema";
import { splitProblems } from "@/lib/sanitize";
import type { Problem } from "@/lib/types";

export const runtime = "nodejs";
export const maxDuration = 60;

interface ExtractBody {
  name?: string;
  text?: string;
  images?: string[]; // data URLs (jpeg/png/webp)
}

const MEDIA = ["image/jpeg", "image/png", "image/webp", "image/gif"] as const;
type Media = (typeof MEDIA)[number];

export async function POST(req: Request) {
  let body: ExtractBody;
  try {
    body = (await req.json()) as ExtractBody;
  } catch {
    return NextResponse.json({ error: "That upload was too large or unreadable. Try a smaller file." }, { status: 400 });
  }
  const text = (body.text ?? "").slice(0, 60_000);
  const images = (body.images ?? []).slice(0, 4);
  const name = (body.name ?? "Assignment").slice(0, 120);

  if (!text.trim() && !images.length) {
    return NextResponse.json({ error: "We couldn't find any text in that file." }, { status: 400 });
  }

  // Without a key we can still split text heuristically; images need the AI.
  if (!hasKey()) {
    if (!text.trim()) {
      return NextResponse.json(
        { error: "Reading photos needs live AI (ANTHROPIC_API_KEY isn't set). Upload a text-based PDF, paste the problem, or try a demo assignment.", code: "no_key" },
        { status: 503 },
      );
    }
    return NextResponse.json({ name, problems: splitProblems(text), source: "heuristic" });
  }
  if (rateLimited(req, 20)) {
    return NextResponse.json({ error: "Too many uploads at once. Try again in a minute." }, { status: 429 });
  }

  const content: Array<
    { type: "text"; text: string } | { type: "image"; source: { type: "base64"; media_type: Media; data: string } }
  > = [];
  for (const img of images) {
    const m = /^data:(image\/[a-z]+);base64,(.+)$/i.exec(img);
    if (!m || !MEDIA.includes(m[1].toLowerCase() as Media)) continue;
    content.push({ type: "image", source: { type: "base64", media_type: m[1].toLowerCase() as Media, data: m[2] } });
  }
  content.push({
    type: "text",
    text: text.trim()
      ? `Assignment file "${name}". Extracted text:\n"""${text}"""\nSplit it into problems.`
      : `Assignment file "${name}" (photo/scan above). Transcribe and split it into problems.`,
  });

  try {
    const data = (await createJSON({
      model: MODEL,
      max_tokens: 12000,
      system: EXTRACT_SYSTEM,
      messages: [{ role: "user", content }],
      effort: "low",
      schema: extractSchema as unknown as Record<string, unknown>,
    })) as { assignmentName?: string; problems?: { title?: string; text?: string; subject?: string }[] };
    const problems: Problem[] = (data.problems ?? [])
      .filter((p) => p?.text && p.text.trim().length > 3)
      .slice(0, 40)
      .map((p, i) => ({
        id: `p${i + 1}`,
        title: (p.title || `Problem ${i + 1}`).slice(0, 80),
        text: p.text!.slice(0, 4000),
        subject: (p.subject || "").slice(0, 40),
      }));
    if (!problems.length && text.trim()) {
      return NextResponse.json({ name, problems: splitProblems(text), source: "heuristic" });
    }
    return NextResponse.json({ name: data.assignmentName || name, problems, source: "ai" });
  } catch (err) {
    console.error("extract error", err);
    if (text.trim()) return NextResponse.json({ name, problems: splitProblems(text), source: "heuristic" });
    const { status, message } = friendlyError(err);
    return NextResponse.json({ error: message }, { status });
  }
}
