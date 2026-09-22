import { NextResponse } from "next/server";
import { MODEL, createJSON, friendlyError, hasKey, rateLimited } from "@/lib/server/claude";
import { TUTOR_SYSTEM, toMessages } from "@/lib/prompt";
import { tutorTurnSchema } from "@/lib/schema";
import { normalizeTurn } from "@/lib/sanitize";
import type { TutorRequest } from "@/lib/types";

export const runtime = "nodejs";
export const maxDuration = 60;

type Effort = "low" | "medium" | "high";

export async function POST(req: Request) {
  if (!hasKey()) {
    return NextResponse.json(
      { error: "Live AI isn't set up on this deployment (missing ANTHROPIC_API_KEY). Try a demo assignment instead.", code: "no_key" },
      { status: 503 },
    );
  }
  if (rateLimited(req)) {
    return NextResponse.json({ error: "Slow down a little — too many requests. Try again in a minute." }, { status: 429 });
  }

  let body: TutorRequest;
  try {
    body = (await req.json()) as TutorRequest;
  } catch {
    return NextResponse.json({ error: "Bad request body." }, { status: 400 });
  }
  if (!body?.problem?.text || typeof body.problem.text !== "string") {
    return NextResponse.json({ error: "Pick a problem first." }, { status: 400 });
  }
  const prefs = {
    format: body.preferences?.format ?? "visual",
    pace: body.preferences?.pace ?? "normal",
    voice: false,
    focus: false,
    speed: 1,
  } as TutorRequest["preferences"];

  const effort = (["low", "medium", "high"].includes(process.env.ANTHROPIC_EFFORT ?? "")
    ? process.env.ANTHROPIC_EFFORT
    : "medium") as Effort;

  try {
    const raw = await createJSON({
      model: MODEL,
      max_tokens: 8000,
      system: TUTOR_SYSTEM,
      messages: toMessages(body.problem, prefs, Array.isArray(body.history) ? body.history : [], String(body.boardSummary ?? ""), String(body.studentMessage ?? "")),
      effort,
      schema: tutorTurnSchema as unknown as Record<string, unknown>,
    });
    const turn = normalizeTurn(raw);
    return NextResponse.json({ turn, model: MODEL });
  } catch (err) {
    console.error("tutor error", err);
    const { status, message } = friendlyError(err);
    return NextResponse.json({ error: message }, { status });
  }
}
