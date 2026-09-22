import { rateLimited } from "@/lib/server/claude";

export const runtime = "nodejs";
export const maxDuration = 30;

// Natural-sounding voice via ElevenLabs. Without ELEVENLABS_API_KEY the browser voice is used instead.
const VOICE = process.env.ELEVENLABS_VOICE_ID?.trim() || "JBFqnCBsd6RMkjVDRZzb";
const MODEL = process.env.ELEVENLABS_MODEL?.trim() || "eleven_flash_v2_5";

export async function POST(req: Request) {
  const key = process.env.ELEVENLABS_API_KEY?.trim();
  if (!key) return Response.json({ error: "no_key" }, { status: 503 });
  if (rateLimited(req, 80)) return Response.json({ error: "rate_limited" }, { status: 429 });
  let text = "";
  try {
    text = String(((await req.json()) as { text?: unknown }).text ?? "").slice(0, 700).trim();
  } catch {}
  if (!text) return Response.json({ error: "empty" }, { status: 400 });
  try {
    const res = await fetch(`https://api.elevenlabs.io/v1/text-to-speech/${VOICE}?output_format=mp3_44100_128`, {
      method: "POST",
      headers: { "xi-api-key": key, "Content-Type": "application/json", Accept: "audio/mpeg" },
      body: JSON.stringify({
        text,
        model_id: MODEL,
        voice_settings: { stability: 0.45, similarity_boost: 0.8, style: 0.25, use_speaker_boost: true },
      }),
    });
    if (!res.ok || !res.body) {
      console.error("tts error", res.status, (await res.text().catch(() => "")).slice(0, 200));
      return Response.json({ error: "tts_failed" }, { status: 502 });
    }
    return new Response(res.body, { headers: { "Content-Type": "audio/mpeg", "Cache-Control": "no-store" } });
  } catch (e) {
    console.error("tts error", e);
    return Response.json({ error: "tts_failed" }, { status: 502 });
  }
}
