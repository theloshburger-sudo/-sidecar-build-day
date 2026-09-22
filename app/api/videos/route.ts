import { NextResponse } from "next/server";

export const runtime = "nodejs";

export interface VideoResult {
  id: string;
  title: string;
  channel: string;
  thumb: string;
}

/** Resolve a search query to real videos when YOUTUBE_API_KEY is set; otherwise the client shows a search link. */
export async function GET(req: Request) {
  const q = new URL(req.url).searchParams.get("q")?.slice(0, 120).trim();
  const key = process.env.YOUTUBE_API_KEY?.trim();
  if (!q) return NextResponse.json({ videos: [] });
  if (!key) return NextResponse.json({ videos: [], fallback: true });
  try {
    const url = new URL("https://www.googleapis.com/youtube/v3/search");
    url.search = new URLSearchParams({
      part: "snippet",
      type: "video",
      maxResults: "2",
      safeSearch: "strict",
      relevanceLanguage: "en",
      videoEmbeddable: "true",
      q,
      key,
    }).toString();
    const res = await fetch(url, { next: { revalidate: 86400 } });
    if (!res.ok) return NextResponse.json({ videos: [], fallback: true });
    const data = (await res.json()) as {
      items?: { id?: { videoId?: string }; snippet?: { title?: string; channelTitle?: string; thumbnails?: { medium?: { url?: string } } } }[];
    };
    const videos: VideoResult[] = (data.items ?? [])
      .filter((i) => i.id?.videoId)
      .map((i) => ({
        id: i.id!.videoId!,
        title: decode(i.snippet?.title ?? ""),
        channel: i.snippet?.channelTitle ?? "",
        thumb: i.snippet?.thumbnails?.medium?.url ?? `https://i.ytimg.com/vi/${i.id!.videoId}/mqdefault.jpg`,
      }));
    return NextResponse.json({ videos });
  } catch {
    return NextResponse.json({ videos: [], fallback: true });
  }
}

function decode(s: string) {
  return s.replace(/&#39;/g, "'").replace(/&quot;/g, '"').replace(/&amp;/g, "&").replace(/&lt;/g, "<").replace(/&gt;/g, ">");
}
