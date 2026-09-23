import Anthropic from "@anthropic-ai/sdk";
import { NextResponse } from "next/server";
import { MODEL, createJSON, friendlyError, getClient, hasKey, rateLimited } from "@/lib/server/claude";
import { TUTOR_SYSTEM, toMessages } from "@/lib/prompt";
import { tutorTurnSchema } from "@/lib/schema";
import { STREAM_ERROR } from "@/lib/stream-parse";
import type { TutorRequest } from "@/lib/types";

export const runtime = "nodejs";
export const maxDuration = 60;

type Effort = "low" | "medium" | "high";

/**
 * Streams the tutor's JSON reply as plain text while Claude writes it. The client parses
 * board actions out of the partial JSON, so Teacher starts talking and drawing within a
 * second or two instead of waiting for the whole reply.
 */
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
    voiceSpeed: 1,
  } as TutorRequest["preferences"];
  const image = typeof body.image === "string" && body.image.length < 3_000_000 ? body.image : undefined;

  const effort = (["low", "medium", "high"].includes(process.env.ANTHROPIC_EFFORT ?? "") ? process.env.ANTHROPIC_EFFORT : "low") as Effort;
  const messages = toMessages(
    body.problem,
    prefs,
    Array.isArray(body.history) ? body.history : [],
    String(body.boardSummary ?? ""),
    String(body.studentMessage ?? ""),
    image,
  ) as Anthropic.MessageParam[];
  const schema = tutorTurnSchema as unknown as Record<string, unknown>;
  const haiku = /haiku/i.test(MODEL);

  const encoder = new TextEncoder();
  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      let sent = false;
      const send = (t: string) => {
        sent = true;
        controller.enqueue(encoder.encode(t));
      };
      const t0 = Date.now();
      let firstAt = 0;
      const run = async (thinkingOff: boolean) => {
        const s = getClient().messages.stream({
          model: MODEL,
          max_tokens: 8000,
          // Cached system prompt: repeat turns skip re-reading it, which cuts time-to-first-token.
          system: [{ type: "text", text: TUTOR_SYSTEM, cache_control: { type: "ephemeral" } }],
          messages,
          // Tutoring steps are short; skipping extended thinking makes Teacher start talking much sooner.
          ...(thinkingOff ? { thinking: { type: "disabled" as const } } : {}),
          output_config: { effort: haiku ? undefined : effort, format: { type: "json_schema", schema } },
        });
        for await (const ev of s) {
          if (ev.type === "content_block_delta" && ev.delta.type === "text_delta") {
            if (!firstAt) firstAt = Date.now();
            send(ev.delta.text);
          }
        }
        const final = await s.finalMessage();
        console.log(
          JSON.stringify({ tutor_timing: { model: MODEL, thinking: !thinkingOff, first_text_ms: firstAt - t0, total_ms: Date.now() - t0, output_tokens: final.usage.output_tokens, cache_read: final.usage.cache_read_input_tokens ?? 0 } }),
        );
      };
      try {
        const wantThinking = process.env.ANTHROPIC_THINKING === "on" || haiku;
        try {
          await run(!wantThinking);
        } catch (err) {
          // Some models don't allow turning thinking off: retry once with it on.
          if (!sent && !wantThinking && err instanceof Anthropic.APIError && err.status === 400 && /thinking/i.test(err.message)) await run(false);
          else throw err;
        }
      } catch (err) {
        const schemaProblem =
          err instanceof Anthropic.APIError && err.status === 400 && /schema|grammar|complex|output_config|format|json/i.test(err.message);
        if (!sent && schemaProblem) {
          try {
            const raw = await createJSON({ model: MODEL, max_tokens: 8000, system: TUTOR_SYSTEM, messages, effort, schema });
            send(JSON.stringify(raw));
          } catch (e2) {
            console.error("tutor fallback error", e2);
            send(STREAM_ERROR + friendlyError(e2).message);
          }
        } else {
          console.error("tutor error", err);
          send(STREAM_ERROR + friendlyError(err).message);
        }
      } finally {
        controller.close();
      }
    },
  });

  return new Response(stream, {
    headers: { "Content-Type": "text/plain; charset=utf-8", "Cache-Control": "no-store", "X-Accel-Buffering": "no" },
  });
}
