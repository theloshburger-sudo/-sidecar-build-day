import { NextResponse } from "next/server";
import { canvasGet, htmlToText } from "@/lib/server/canvas";
import { canvasFailure, withCanvas } from "../shared";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** One assignment's instructions as plain text; the client splits it into problems via /api/extract. */
export async function GET(req: Request) {
  const u = new URL(req.url);
  const course = u.searchParams.get("course") ?? "";
  const id = u.searchParams.get("id") ?? "";
  if (!/^\d{1,15}$/.test(course) || !/^\d{1,15}$/.test(id)) return NextResponse.json({ error: "Bad assignment id." }, { status: 400 });
  const ctx = await withCanvas(req);
  if ("error" in ctx) return ctx.error;
  try {
    const a = await canvasGet<{ name?: string; description?: string | null }>(ctx.link.baseUrl, ctx.link.token, `/api/v1/courses/${course}/assignments/${id}`);
    const text = htmlToText(a.description ?? "");
    if (!text) return NextResponse.json({ error: "This assignment has no written instructions in Canvas (it may be a file or a link). Download it and drop it in instead.", code: "empty" }, { status: 422 });
    return NextResponse.json({ name: (a.name ?? "Canvas assignment").slice(0, 120), text: text.slice(0, 60_000) });
  } catch (err) {
    return canvasFailure(err);
  }
}
