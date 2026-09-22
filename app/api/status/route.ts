import { NextResponse } from "next/server";
import { MODEL, hasKey } from "@/lib/server/claude";

export const dynamic = "force-dynamic";

export function GET() {
  return NextResponse.json({ live: hasKey(), model: MODEL, videos: Boolean(process.env.YOUTUBE_API_KEY?.trim()) });
}
