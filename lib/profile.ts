// What Teacher has learned about how this student learns. Stored only in this browser.

const KEY = "sidecar.learner.v1";
const MAX = 10;

export function loadLearner(): string[] {
  try {
    const v = JSON.parse(localStorage.getItem(KEY) || "[]");
    return Array.isArray(v) ? v.filter((n) => typeof n === "string").slice(0, MAX) : [];
  } catch {
    return [];
  }
}

function save(notes: string[]) {
  try {
    localStorage.setItem(KEY, JSON.stringify(notes));
  } catch {}
}

const key = (n: string) => n.toLowerCase().replace(/[^a-z0-9 ]/g, "").trim();

/** Add a new note (newest first). Returns the updated list, or null if it wasn't new. */
export function addInsight(note: string): string[] | null {
  const clean = note.trim().replace(/\.$/, "");
  if (!clean || clean.length < 4) return null;
  const notes = loadLearner();
  if (notes.some((n) => key(n) === key(clean))) return null;
  const next = [clean, ...notes].slice(0, MAX);
  save(next);
  return next;
}

export function forgetLearner() {
  save([]);
}
