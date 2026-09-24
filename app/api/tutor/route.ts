import Anthropic from "@anthropic-ai/sdk";
import { NextResponse } from "next/server";
import { MODEL, friendlyError, getClient, hasKey, rateLimited, retryable } from "@/lib/server/claude";
import { PROMPTED_FORMAT, TUTOR_SYSTEM, toMessages } from "@/lib/prompt";
import { tutorTurnSchema } from "@/lib/schema";
import { STREAM_ERROR } from "@/lib/stream-parse";
import type { TutorRequest } from "@/lib/types";

export const runtime = "nodejs";
export const maxDuration = 60;

type Effort = "low" | "medium" | "high";

/** Claude finished without writing anything we could use. */
class EmptyReply extends Error {
  constructor(stop: string) {
    super(`empty reply (stop_reason: ${stop})`);
  }
}

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
    (Array.isArray(body.learner) ? body.learner : [])
      .filter((n): n is string => typeof n === "string")
      .map((n) => n.slice(0, 120))
      .slice(0, 12),
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
      /**
       * "structured": the JSON schema is enforced by the API (output_config.format).
       * "prompted": no schema, just the format described in the prompt (like Clicky's plain text + tags).
       * Nothing to compile or reject, so it's the fallback when the structured call fails.
       */
      const run = async (mode: "structured" | "prompted", thinkingOff: boolean) => {
        const s = getClient().messages.stream({
          model: MODEL,
          max_tokens: 8000,
          // Cached system prompt: repeat turns skip re-reading it, which cuts time-to-first-token.
          system: [
            { type: "text", text: TUTOR_SYSTEM, cache_control: { type: "ephemeral" } },
            ...(mode === "prompted" ? [{ type: "text" as const, text: PROMPTED_FORMAT }] : []),
          ],
          messages,
          // Tutoring steps are short; skipping extended thinking makes Teacher start talking much sooner.
          ...(thinkingOff ? { thinking: { type: "disabled" as const } } : {}),
          output_config: {
            effort: haiku ? undefined : effort,
            ...(mode === "structured" ? { format: { type: "json_schema" as const, schema } } : {}),
          },
        });
        // Prompted replies may open with a ``` fence or a word or two: start at the JSON itself.
        let lead = mode === "prompted";
        for await (const ev of s) {
          if (ev.type === "content_block_delta" && ev.delta.type === "text_delta") {
            let t = ev.delta.text;
            if (lead) {
              const i = t.indexOf("{");
              if (i < 0) continue;
              t = t.slice(i);
              lead = false;
            }
            if (!t) continue;
            if (!firstAt) firstAt = Date.now();
            send(t);
          }
        }
        const final = await s.finalMessage();
        console.log(
          JSON.stringify({ tutor_timing: { model: MODEL, mode, thinking: !thinkingOff, stop: final.stop_reason, first_text_ms: firstAt ? firstAt - t0 : null, total_ms: Date.now() - t0, output_tokens: final.usage.output_tokens, cache_read: final.usage.cache_read_input_tokens ?? 0 } }),
        );
        if (!sent) throw new EmptyReply(String(final.stop_reason));
      };
      try {
        const wantThinking = process.env.ANTHROPIC_THINKING === "on" || haiku;
        let thinkingOff = !wantThinking;
        let mode: "structured" | "prompted" = process.env.TUTOR_OUTPUT === "prompted" ? "prompted" : "structured";
        for (let attempt = 1; ; attempt++) {
          try {
            await run(mode, thinkingOff);
            break;
          } catch (err) {
            const status = err instanceof Anthropic.APIError ? err.status : undefined;
            console.error("tutor attempt failed", { attempt, mode, sent, status, type: (err as { type?: unknown }).type, message: String((err as Error)?.message ?? err).slice(0, 400) });
            if (sent || attempt >= 5) throw err;
            // Some models don't allow turning thinking off: retry with it on.
            if (thinkingOff && status === 400 && /thinking/i.test(String((err as Error).message))) {
              thinkingOff = false;
              continue;
            }
            // The structured call was rejected (schema too complex, a format rule…) or came back
            // empty: answer again right away without the schema, so the student never sees it.
            if (mode === "structured" && (status === 400 || status === 422 || err instanceof EmptyReply)) {
              mode = "prompted";
              continue;
            }
            // Overloaded / dropped / empty before Teacher said anything: quietly try again.
            if (attempt < 4 && (err instanceof EmptyReply || retryable(err))) {
              await new Promise((r) => setTimeout(r, 600 * attempt));
              continue;
            }
            throw err;
          }
        }
      } catch (err) {
        console.error("tutor error", err);
        send(STREAM_ERROR + (err instanceof EmptyReply ? "Teacher didn't get an answer back. Tap Try again." : friendlyError(err).message));
      } finally {
        controller.close();
      }
    },
  });

  return new Response(stream, {
    headers: { "Content-Type": "text/plain; charset=utf-8", "Cache-Control": "no-store", "X-Accel-Buffering": "no" },
  });
}
