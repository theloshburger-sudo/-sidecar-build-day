import { NextResponse } from "next/server";
import { canvasGet, mapPlanner } from "@/lib/server/canvas";
import { canvasFailure, withCanvas } from "../shared";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const DAY = 86_400_000;

/** Unsubmitted work from a week ago through the next two weeks, soonest first. */
export async function GET(req: Request) {
  const ctx = await withCanvas(req);
  if ("error" in ctx) return ctx.error;
  const now = Date.now();
  const q = new URLSearchParams({
    start_date: new Date(now - 7 * DAY).toISOString(),
    end_date: new Date(now + 14 * DAY).toISOString(),
    per_page: "100",
  });
  try {
    const items = await canvasGet<unknown[]>(ctx.link.baseUrl, ctx.link.token, `/api/v1/planner/items?${q}`);
    return NextResponse.json({ items: mapPlanner(items as Parameters<typeof mapPlanner>[0], ctx.link.baseUrl).slice(0, 40) });
  } catch (err) {
    return canvasFailure(err);
  }
}
