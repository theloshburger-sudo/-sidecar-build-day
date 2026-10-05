"use client";

import { useEffect, useState } from "react";
import { useAccount } from "@/lib/account";
import { isMastered, type Concept } from "@/lib/review";
import type { Assignment } from "@/lib/types";

const DAY = 86_400_000;

function when(iso: string | null, now: number): string {
  if (!iso) return "mastered";
  const d = Math.round((new Date(iso).getTime() - now) / DAY);
  if (d <= 0) return "review now";
  return d === 1 ? "review tomorrow" : `review in ${d} days`;
}

/** A one-problem assignment whose id tells Session to run the warm-up on this concept. */
export function reviewAssignment(c: Concept): Assignment {
  return {
    name: `Review · ${c.label}`,
    problems: [
      {
        id: `review:${c.slug}`,
        title: `Quick review: ${c.label}`,
        text: `Quick review of an idea I missed before: "${c.label}"${c.subject ? ` (${c.subject})` : ""}. Ask me a short question on it, then give me one fresh practice problem to do on my own.`,
        subject: c.subject,
      },
    ],
  };
}

export default function WeakSpots({ onAssignment }: { onAssignment: (a: Assignment) => void }) {
  const { memory } = useAccount();
  const [concepts, setConcepts] = useState<Concept[]>([]);
  const [showMastered, setShowMastered] = useState(false);
  const [now] = useState(() => Date.now());

  useEffect(() => {
    memory?.concepts().then(setConcepts).catch((e) => console.warn("couldn't load weak spots", e));
  }, [memory]);

  if (!concepts.length) return null;
  const byDue = (a: Concept, b: Concept) => (a.nextReviewAt ?? "9").localeCompare(b.nextReviewAt ?? "9");
  const active = concepts.filter((c) => !isMastered(c)).sort(byDue);
  const mastered = concepts.filter(isMastered);
  const due = active.filter((c) => c.nextReviewAt && new Date(c.nextReviewAt).getTime() <= now).length;

  return (
    <section className="weak-spots">
      <div className="section-head">
        <h2>Your weak spots</h2>
        <p className="muted">
          {due ? `${due} ready for a 1-minute review. ` : ""}Teacher brings each idea back right before you&apos;d forget it: 2 days, then 1 week, 3 weeks, 2 months.
        </p>
      </div>
      <ul className="spot-list">
        {active.map((c) => {
          const isDue = !!c.nextReviewAt && new Date(c.nextReviewAt).getTime() <= now;
          return (
            <li key={c.slug} className={`card spot ${isDue ? "spot--due" : ""}`}>
              {c.subject && <span className="tag">{c.subject}</span>}
              <strong>{c.label}</strong>
              <span className="spot-meta">
                <span title="Times you missed it">✗ {c.misses}</span>
                <span title="Times you got it on a review">✓ {c.hits}</span>
                <span className="spot-ladder" aria-label={`Review ${c.step} of 4`}>
                  {[0, 1, 2, 3].map((i) => (
                    <i key={i} className={i < c.step ? "on" : ""} />
                  ))}
                </span>
                <span>{when(c.nextReviewAt, now)}</span>
              </span>
              {isDue && (
                <button className="btn btn--primary spot-review" onClick={() => onAssignment(reviewAssignment(c))}>
                  Review
                </button>
              )}
            </li>
          );
        })}
      </ul>
      {mastered.length > 0 && (
        <button className="link-back small" onClick={() => setShowMastered((v) => !v)} aria-expanded={showMastered}>
          {showMastered ? "Hide" : "Show"} {mastered.length} mastered
        </button>
      )}
      {showMastered && (
        <ul className="spot-list">
          {mastered.map((c) => (
            <li key={c.slug} className="card spot spot--mastered">
              <strong>✓ {c.label}</strong>
              <span className="spot-meta">{c.subject}</span>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
