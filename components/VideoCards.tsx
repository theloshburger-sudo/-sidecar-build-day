"use client";

import { useEffect, useState } from "react";
import type { VideoSuggestion } from "@/lib/types";

interface Resolved {
  id: string;
  title: string;
  channel: string;
  thumb: string;
}

/** 1–2 tightly relevant videos. Real cards when a YouTube key is configured, search links otherwise. */
export default function VideoCards({ videos, enabled }: { videos: VideoSuggestion[]; enabled: boolean }) {
  const [resolved, setResolved] = useState<Record<string, Resolved | null>>({});

  useEffect(() => {
    if (!enabled) return;
    let cancelled = false;
    for (const v of videos) {
      if (v.query in resolved) continue;
      fetch(`/api/videos?q=${encodeURIComponent(v.query)}`)
        .then((r) => r.json())
        .then((d: { videos?: Resolved[] }) => {
          if (!cancelled) setResolved((m) => ({ ...m, [v.query]: d.videos?.[0] ?? null }));
        })
        .catch(() => !cancelled && setResolved((m) => ({ ...m, [v.query]: null })));
    }
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [videos, enabled]);

  return (
    <div className="videos card">
      <p className="videos-head">
        <span aria-hidden>▶</span> If you want another angle, one short video:
      </p>
      <div className="videos-row">
        {videos.slice(0, 2).map((v) => {
          const r = resolved[v.query];
          const search = `https://www.youtube.com/results?search_query=${encodeURIComponent(v.query)}`;
          return r ? (
            <a key={v.query} className="video" href={`https://www.youtube.com/watch?v=${r.id}`} target="_blank" rel="noreferrer">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={r.thumb} alt="" width={160} height={90} />
              <span>
                <strong>{r.title}</strong>
                <small>{r.channel}</small>
              </span>
            </a>
          ) : (
            <a key={v.query} className="video video--search" href={search} target="_blank" rel="noreferrer">
              <span className="video-play" aria-hidden>
                ▶
              </span>
              <span>
                <strong>{v.title || v.query}</strong>
                <small>Search YouTube: &ldquo;{v.query}&rdquo;</small>
              </span>
            </a>
          );
        })}
      </div>
    </div>
  );
}
