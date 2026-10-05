import { NextResponse } from "next/server";
import { rateLimited } from "@/lib/server/claude";
import { CanvasError, decryptToken } from "@/lib/server/canvas";
import { userDb } from "@/lib/server/user-db";

export const canvasKey = () => process.env.CANVAS_TOKEN_KEY?.trim() || "";

/** The signed-in student, or the error response to send. */
export async function withUser(req: Request) {
  if (!canvasKey()) return { error: NextResponse.json({ error: "Canvas isn't set up on this deployment yet.", code: "not_configured" }, { status: 503 }) };
  if (rateLimited(req, 60, undefined, "canvas")) return { error: NextResponse.json({ error: "Too many Canvas requests. Try again in a minute." }, { status: 429 }) };
  const auth = await userDb(req);
  if (!auth) return { error: NextResponse.json({ error: "Sign in to connect Canvas.", code: "signed_out" }, { status: 401 }) };
  return auth;
}

/** Signed-in student + their decrypted Canvas link, or the error response to send. */
export async function withCanvas(req: Request) {
  const auth = await withUser(req);
  if ("error" in auth) return auth;
  const { data, error } = await auth.db.from("sidecar_canvas_links").select("base_url, token_ciphertext").maybeSingle();
  if (error) return { error: NextResponse.json({ error: "Couldn't load your Canvas link. Try again." }, { status: 500 }) };
  if (!data) return { error: NextResponse.json({ error: "Connect Canvas first.", code: "not_linked" }, { status: 404 }) };
  try {
    return { ...auth, link: { baseUrl: data.base_url as string, token: decryptToken(data.token_ciphertext as string, canvasKey()) } };
  } catch {
    return { error: NextResponse.json({ error: "Your saved Canvas token can't be read anymore. Reconnect Canvas.", code: "token_rejected" }, { status: 401 }) };
  }
}

export function canvasFailure(err: unknown) {
  if (err instanceof CanvasError) return NextResponse.json({ error: err.message, code: err.code }, { status: err.status });
  console.error("canvas error", err);
  return NextResponse.json({ error: "Something went wrong talking to Canvas. Try again." }, { status: 500 });
}
