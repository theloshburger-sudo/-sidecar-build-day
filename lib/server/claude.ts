import "server-only";
import Anthropic from "@anthropic-ai/sdk";

export const MODEL = process.env.ANTHROPIC_MODEL?.trim() || "claude-sonnet-5";

let client: Anthropic | null = null;

export function hasKey(): boolean {
  return Boolean(process.env.ANTHROPIC_API_KEY?.trim());
}

export function getClient(): Anthropic {
  if (!client) client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY, maxRetries: 1, timeout: 55_000 });
  return client;
}

/** Pull the JSON text out of a structured-output response. */
export function jsonFromMessage(msg: Anthropic.Message): unknown {
  const text = msg.content
    .filter((b): b is Anthropic.TextBlock => b.type === "text")
    .map((b) => b.text)
    .join("")
    .trim();
  if (!text) throw new Error(`Empty model response (stop_reason: ${msg.stop_reason})`);
  const unfenced = text.replace(/^```(?:json)?\s*/i, "").replace(/```\s*$/, "");
  try {
    return JSON.parse(unfenced);
  } catch {
    // Last resort: grab the outermost JSON object.
    const start = text.indexOf("{");
    const end = text.lastIndexOf("}");
    if (start >= 0 && end > start) return JSON.parse(text.slice(start, end + 1));
    throw new Error("Model did not return JSON");
  }
}

type CreateParams = Omit<Anthropic.MessageCreateParamsNonStreaming, "output_config"> & {
  effort: "low" | "medium" | "high";
  schema: Record<string, unknown>;
};

/**
 * Ask for JSON matching `schema` using structured outputs. If the API rejects the
 * schema itself (e.g. grammar too complex on some model), retry once without the
 * constraint and parse the JSON from plain text instead.
 */
export async function createJSON({ effort: requested, schema, ...params }: CreateParams): Promise<unknown> {
  const client = getClient();
  // Haiku-class models don't take the effort parameter.
  const effort = /haiku/i.test(params.model) ? undefined : requested;
  try {
    const msg = await client.messages.create({ ...params, output_config: { effort, format: { type: "json_schema", schema } } });
    return jsonFromMessage(msg);
  } catch (err) {
    const schemaProblem =
      err instanceof Anthropic.APIError && err.status === 400 && /schema|grammar|complex|output_config|format|json/i.test(err.message);
    if (!schemaProblem) throw err;
    console.warn("structured output rejected, retrying as plain JSON:", (err as Error).message.slice(0, 200));
    const system = `${typeof params.system === "string" ? params.system : ""}\n\nReturn ONLY one raw JSON object (no markdown fences) that follows this JSON schema:\n${JSON.stringify(schema)}`;
    const msg = await client.messages.create({ ...params, system, output_config: { effort } });
    return jsonFromMessage(msg);
  }
}

export function friendlyError(err: unknown): { status: number; message: string } {
  if (err instanceof Anthropic.APIError) {
    if (err.status === 401) return { status: 502, message: "The Anthropic API key was rejected. Check ANTHROPIC_API_KEY in your environment variables." };
    if (err.status === 429) return { status: 429, message: "Teacher is getting a lot of questions right now. Wait a few seconds and try again." };
    if (err.status === 400) return { status: 502, message: `The AI request was rejected: ${err.message.slice(0, 200)}` };
    if (err.status && err.status >= 500) return { status: 503, message: "The AI service is having a moment. Try again, or switch to demo mode." };
  }
  const msg = err instanceof Error ? err.message : String(err);
  // Errors inside a stream (e.g. overloaded mid-answer) arrive with no HTTP status, only a type.
  const type = err instanceof Anthropic.APIError ? String((err as { type?: unknown }).type ?? "") || /"type":"(\w+)"/.exec(msg)?.[1] || "" : "";
  if (/overloaded/i.test(type + msg)) return { status: 503, message: "Claude is overloaded for a moment. Try again in a few seconds." };
  if (/timeout|timed out/i.test(msg)) return { status: 504, message: "Teacher took too long to answer. Try again." };
  const detail = (type || msg).replace(/\s+/g, " ").slice(0, 120);
  return { status: 500, message: `Something went wrong talking to the AI${detail ? ` (${detail})` : ""}. Try again.` };
}

/** Worth trying again: overloaded, rate-limited, server-side or connection trouble (not bad requests or bad keys). */
export function retryable(err: unknown): boolean {
  if (err instanceof Anthropic.APIError) {
    if (err.status === undefined) return true; // mid-stream error event (overloaded_error, api_error) or dropped connection
    return err.status === 429 || err.status >= 500;
  }
  return true;
}

// ---- very small in-memory rate limiter (per server instance) ----
const hits = new Map<string, number[]>();

/**
 * Each route counts in its own bucket: Teacher fetches a voice clip for every spoken line,
 * and those must not use up the student's budget of tutor turns.
 */
export function rateLimited(req: Request, limit = 40, windowMs = 10 * 60_000, bucket = "tutor"): boolean {
  const ip = req.headers.get("x-forwarded-for")?.split(",")[0].trim() || "local";
  const k = `${bucket}|${ip}`;
  const now = Date.now();
  const list = (hits.get(k) ?? []).filter((t) => now - t < windowMs);
  list.push(now);
  hits.set(k, list);
  if (hits.size > 5000) hits.clear();
  return list.length > limit;
}
