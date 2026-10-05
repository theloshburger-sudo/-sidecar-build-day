import { NextResponse } from "next/server";
import { CanvasError, assertSafeBaseUrl, canvasGet, encryptToken } from "@/lib/server/canvas";
import { canvasFailure, canvasKey, withUser } from "../shared";

export const runtime = "nodejs";

/** Is this student linked? (Never returns the token.) */
export async function GET(req: Request) {
  const ctx = await withUser(req);
  if ("error" in ctx) return ctx.error;
  const { data, error } = await ctx.db.from("sidecar_canvas_links").select("base_url").maybeSingle();
  // A database hiccup must not look like "not connected" (the student would paste their token again).
  if (error) return NextResponse.json({ error: "Couldn't check your Canvas connection. Try again." }, { status: 500 });
  return NextResponse.json({ linked: Boolean(data), baseUrl: data?.base_url ?? null });
}

/** Save a link after proving the token works against that Canvas. */
export async function POST(req: Request) {
  const ctx = await withUser(req);
  if ("error" in ctx) return ctx.error;
  const body = (await req.json().catch(() => ({}))) as { baseUrl?: unknown; token?: unknown };
  const token = typeof body.token === "string" ? body.token.trim() : "";
  if (!token || token.length > 400 || /\s/.test(token)) return NextResponse.json({ error: "Paste the whole access token from Canvas (one line, no spaces)." }, { status: 400 });
  try {
    const baseUrl = await assertSafeBaseUrl(typeof body.baseUrl === "string" ? body.baseUrl : "");
    // Some Canvas sites answer a bad token with 403/404 instead of 401: here they all mean "wrong token".
    const me = await canvasGet<{ name?: string }>(baseUrl, token, "/api/v1/users/self").catch((e) => {
      throw e instanceof CanvasError && (e.code === "not_found" || e.code === "token_rejected")
        ? new CanvasError("Canvas didn't accept that token. Copy it again from Account → Settings (Canvas shows it only once), or make a new one.", 401, "token_rejected")
        : e;
    });
    const { error } = await ctx.db
      .from("sidecar_canvas_links")
      .upsert({ user_id: ctx.user.id, base_url: baseUrl, token_ciphertext: encryptToken(token, canvasKey(), ctx.user.id) }, { onConflict: "user_id" });
    if (error) throw error;
    return NextResponse.json({ linked: true, baseUrl, name: me?.name ?? "" });
  } catch (err) {
    return canvasFailure(err);
  }
}

export async function DELETE(req: Request) {
  const ctx = await withUser(req);
  if ("error" in ctx) return ctx.error;
  const { error } = await ctx.db.from("sidecar_canvas_links").delete().eq("user_id", ctx.user.id);
  if (error) return NextResponse.json({ error: "Couldn't disconnect. Try again." }, { status: 500 });
  return NextResponse.json({ linked: false });
}
