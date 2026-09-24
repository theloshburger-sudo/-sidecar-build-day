import { rateLimited } from "@/lib/server/claude";
import { NATURAL_VOICES, elevenVoiceId } from "@/lib/voices";

export const runtime = "nodejs";
export const maxDuration = 30;

// Natural-sounding voice via ElevenLabs. Without ELEVENLABS_API_KEY the browser voice is used instead.
const VOICE = process.env.ELEVENLABS_VOICE_ID?.trim() || "JBFqnCBsd6RMkjVDRZzb";
const MODEL = process.env.ELEVENLABS_MODEL?.trim() || "eleven_flash_v2_5";

function callEleven(key: string, voice: string, text: string) {
  return fetch(`https://api.elevenlabs.io/v1/text-to-speech/${voice}?output_format=mp3_44100_128`, {
    method: "POST",
    headers: { "xi-api-key": key, "Content-Type": "application/json", Accept: "audio/mpeg" },
    body: JSON.stringify({
      text,
      model_id: MODEL,
      voice_settings: { stability: 0.45, similarity_boost: 0.8, style: 0.25, use_speaker_boost: true },
    }),
  });
}

/** 429 = too many requests at once for the ElevenLabs plan: wait a moment and try again (twice). */
async function callWithRetry(key: string, voice: string, text: string) {
  let res = await callEleven(key, voice, text);
  for (let i = 1; i <= 2 && res.status === 429; i++) {
    await new Promise((r) => setTimeout(r, 450 * i));
    res = await callEleven(key, voice, text);
  }
  return res;
}

/**
 * GET /api/tts: checks every voice against ElevenLabs and reports what came back,
 * so a broken voice shows its real reason (quota, plan, voice not available, rate limit).
 */
export async function GET(req: Request) {
  const key = process.env.ELEVENLABS_API_KEY?.trim();
  if (!key) return Response.json({ ok: false, problem: "ELEVENLABS_API_KEY is not set on this deployment" });
  if (rateLimited(req, 6, undefined, "tts-check")) return Response.json({ error: "rate_limited" }, { status: 429 });
  const voices = [];
  for (const v of NATURAL_VOICES) {
    const t0 = Date.now();
    const res = await callWithRetry(key, v.eleven, "Hi.").catch((e: Error) => ({ ok: false, status: 0, text: async () => e.message }) as Response);
    const detail = res.ok ? "" : (await res.text().catch(() => "")).slice(0, 240);
    if (res.ok) await res.arrayBuffer().catch(() => null);
    voices.push({ voice: v.id, status: res.status, ok: res.ok, ms: Date.now() - t0, ...(detail ? { detail } : {}) });
  }
  return Response.json({ ok: voices.every((v) => v.ok), model: MODEL, voices });
}

export async function POST(req: Request) {
  const key = process.env.ELEVENLABS_API_KEY?.trim();
  if (!key) return Response.json({ error: "no_key" }, { status: 503 });
  if (rateLimited(req, 150, undefined, "tts")) return Response.json({ error: "rate_limited" }, { status: 429 });
  let text = "";
  let voice = VOICE;
  try {
    const body = (await req.json()) as { text?: unknown; voice?: unknown };
    text = String(body.text ?? "").slice(0, 700).trim();
    voice = elevenVoiceId(String(body.voice ?? "")) ?? VOICE;
  } catch {}
  if (!text) return Response.json({ error: "empty" }, { status: 400 });
  try {
    let res = await callWithRetry(key, voice, text);
    // A picked voice that's unavailable on this account falls back to the default voice.
    if (!res.ok && voice !== VOICE && res.status >= 400 && res.status < 500 && res.status !== 429) res = await callWithRetry(key, VOICE, text);
    if (!res.ok || !res.body) {
      console.error("tts error", { voice, status: res.status, body: (await res.text().catch(() => "")).slice(0, 300) });
      return Response.json({ error: "tts_failed" }, { status: 502 });
    }
    return new Response(res.body, { headers: { "Content-Type": "audio/mpeg", "Cache-Control": "no-store" } });
  } catch (e) {
    console.error("tts error", e);
    return Response.json({ error: "tts_failed" }, { status: 502 });
  }
}
