// Spaced review: a concept you missed comes back for a quick check after 2 days,
// then 7, 21 and 60 days each time you get it right. A miss starts it over.

export const INTERVALS = [2, 7, 21, 60];
const DAY = 86_400_000;

export interface ConceptRef {
  slug: string;
  label: string;
  subject: string;
}

export interface Concept extends ConceptRef {
  misses: number;
  hits: number;
  /** Rungs climbed on the ladder; INTERVALS.length means mastered. */
  step: number;
  /** ISO time the next warm-up is due, or null once mastered. */
  nextReviewAt: string | null;
  lastSeenAt: string;
}

export type ReviewEvent = "miss" | "hit";

export function applyEvent(prev: Concept | undefined, ref: ConceptRef, event: ReviewEvent, now = new Date()): Concept {
  const base: Concept = prev ?? { ...ref, misses: 0, hits: 0, step: 0, nextReviewAt: null, lastSeenAt: now.toISOString() };
  const step = event === "miss" ? 0 : Math.min(base.step + 1, INTERVALS.length);
  return {
    ...base,
    label: ref.label || base.label,
    subject: ref.subject || base.subject,
    misses: base.misses + (event === "miss" ? 1 : 0),
    hits: base.hits + (event === "hit" ? 1 : 0),
    step,
    nextReviewAt: step < INTERVALS.length ? new Date(now.getTime() + INTERVALS[step] * DAY).toISOString() : null,
    lastSeenAt: now.toISOString(),
  };
}

export const isMastered = (c: Concept) => c.step >= INTERVALS.length;

const isDue = (c: Concept, now: Date) => !!c.nextReviewAt && new Date(c.nextReviewAt).getTime() <= now.getTime();

/** The one concept to warm up on: most overdue in this subject, else most overdue anywhere. */
export function dueConcept(concepts: Concept[], subject: string, now = new Date()): Concept | null {
  const due = concepts.filter((c) => isDue(c, now)).sort((a, b) => a.nextReviewAt!.localeCompare(b.nextReviewAt!));
  const s = subject.trim().toLowerCase();
  return (s && due.find((c) => c.subject.toLowerCase() === s)) || due[0] || null;
}

/** Turn whatever the model wrote into a stable kebab-case key. */
export function toSlug(raw: string): string {
  return raw
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 40)
    .replace(/-+$/, "");
}
