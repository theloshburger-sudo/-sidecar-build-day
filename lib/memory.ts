// What Teacher remembers about a student: missed concepts (with spaced review), how they
// learn, and finished sessions. Guests keep it in this browser; signed-in students keep it
// in Supabase (row-level security: every row belongs to its user).

import type { SupabaseClient } from "@supabase/supabase-js";
import { applyEvent, type Concept, type ConceptRef, type ReviewEvent } from "./review";

export interface Recap {
  id?: string;
  date: string;
  title: string;
  subject: string;
  gap: string;
  result: string;
}

/** One write per session event. The first event for an id is the only one that moves the schedule. */
export interface SessionRecord {
  id: string;
  title?: string;
  subject?: string;
  gap?: string;
  concept?: ConceptRef;
  event?: ReviewEvent;
  result?: string;
}

export interface MemoryStore {
  kind: "local" | "cloud";
  concepts(): Promise<Concept[]>;
  notes(): Promise<string[]>;
  recaps(): Promise<Recap[]>;
  recordSession(r: SessionRecord): Promise<void>;
  /** Returns the updated notes, or null if the note wasn't new. */
  addNote(note: string): Promise<string[] | null>;
  forgetNotes(): Promise<void>;
  forget(): Promise<void>;
}

const MAX_NOTES = 10;
const MAX_RECAPS = 20;
const noteKey = (n: string) => n.toLowerCase().replace(/[^a-z0-9 ]/g, "").trim();
const cleanNote = (n: string) => n.trim().replace(/\.$/, "").slice(0, 120);

type KV = Pick<Storage, "getItem" | "setItem" | "removeItem">;

export const LOCAL_KEYS = {
  notes: "sidecar.learner.v1",
  recaps: "sidecar.recaps.v1",
  concepts: "sidecar.concepts.v1",
  sessions: "sidecar.sessions.v1",
};

export class LocalMemory implements MemoryStore {
  kind = "local" as const;
  constructor(private store: KV) {}

  private read<T>(key: string, fallback: T): T {
    try {
      const v = JSON.parse(this.store.getItem(key) || "null");
      return v ?? fallback;
    } catch {
      return fallback;
    }
  }
  private write(key: string, v: unknown) {
    try {
      this.store.setItem(key, JSON.stringify(v));
    } catch {}
  }

  async concepts() {
    const v = this.read<Concept[]>(LOCAL_KEYS.concepts, []);
    return Array.isArray(v) ? v : [];
  }
  async notes() {
    const v = this.read<unknown[]>(LOCAL_KEYS.notes, []);
    return Array.isArray(v) ? v.filter((n): n is string => typeof n === "string").slice(0, MAX_NOTES) : [];
  }
  async recaps() {
    const v = this.read<Recap[]>(LOCAL_KEYS.recaps, []);
    return Array.isArray(v) ? v : [];
  }

  async recordSession(r: SessionRecord) {
    if (r.concept && r.event) {
      const seen = this.read<Record<string, ReviewEvent>>(LOCAL_KEYS.sessions, {});
      if (!seen[r.id]) {
        const list = await this.concepts();
        const i = list.findIndex((c) => c.slug === r.concept!.slug);
        const next = applyEvent(i >= 0 ? list[i] : undefined, r.concept, r.event);
        if (i >= 0) list[i] = next;
        else list.push(next);
        this.write(LOCAL_KEYS.concepts, list);
        // ponytail: keeps the last 200 session ids; a retry older than that would count twice.
        const ids = Object.keys(seen);
        if (ids.length >= 200) delete seen[ids[0]];
        seen[r.id] = r.event;
        this.write(LOCAL_KEYS.sessions, seen);
      }
    }
    if (r.result) {
      const recaps = await this.recaps();
      const i = recaps.findIndex((x) => x.id === r.id);
      if (i >= 0) {
        const old = recaps[i];
        recaps[i] = { ...old, result: r.result, gap: r.gap || old.gap, title: r.title || old.title, subject: r.subject || old.subject };
      } else {
        recaps.unshift({ id: r.id, date: new Date().toISOString(), title: r.title ?? "", subject: r.subject ?? "", gap: r.gap ?? "", result: r.result });
      }
      this.write(LOCAL_KEYS.recaps, recaps.slice(0, MAX_RECAPS));
    }
  }

  async addNote(note: string) {
    const clean = cleanNote(note);
    if (clean.length < 4) return null;
    const notes = await this.notes();
    if (notes.some((n) => noteKey(n) === noteKey(clean))) return null;
    const next = [clean, ...notes].slice(0, MAX_NOTES);
    this.write(LOCAL_KEYS.notes, next);
    return next;
  }

  async forgetNotes() {
    this.store.removeItem(LOCAL_KEYS.notes);
  }

  /** Give old recaps (saved before ids existed) a permanent id, so a retried import can't duplicate them. */
  async recapsWithIds(): Promise<Recap[]> {
    const recaps = await this.recaps();
    if (recaps.every((r) => isUuid(r.id))) return recaps;
    const fixed = recaps.map((r) => (isUuid(r.id) ? r : { ...r, id: newId() }));
    this.write(LOCAL_KEYS.recaps, fixed);
    return fixed;
  }

  async forget() {
    Object.values(LOCAL_KEYS).forEach((k) => this.store.removeItem(k));
  }
}

interface ConceptRow {
  slug: string;
  label: string;
  subject: string;
  misses: number;
  hits: number;
  step: number;
  next_review_at: string | null;
  last_seen_at: string;
}

const fromRow = (r: ConceptRow): Concept => ({
  slug: r.slug,
  label: r.label,
  subject: r.subject,
  misses: r.misses,
  hits: r.hits,
  step: r.step,
  nextReviewAt: r.next_review_at,
  lastSeenAt: r.last_seen_at,
});

/** UUID v4. crypto.randomUUID only exists on https/localhost, so fall back to getRandomValues. */
export function newId(): string {
  if (typeof crypto.randomUUID === "function") return crypto.randomUUID();
  const b = crypto.getRandomValues(new Uint8Array(16));
  b[6] = (b[6] & 0x0f) | 0x40;
  b[8] = (b[8] & 0x3f) | 0x80;
  const h = [...b].map((x) => x.toString(16).padStart(2, "0")).join("");
  return `${h.slice(0, 8)}-${h.slice(8, 12)}-${h.slice(12, 16)}-${h.slice(16, 20)}-${h.slice(20)}`;
}

const isUuid = (s?: string) => !!s && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(s);

export class CloudMemory implements MemoryStore {
  kind = "cloud" as const;
  constructor(private db: SupabaseClient, private userId: string) {}

  async concepts() {
    const { data, error } = await this.db.from("sidecar_concepts").select("*").order("last_seen_at", { ascending: false }).limit(200);
    if (error) throw error;
    return (data as ConceptRow[]).map(fromRow);
  }
  async notes() {
    const { data, error } = await this.db.from("sidecar_learner_notes").select("note").order("created_at", { ascending: false }).limit(MAX_NOTES);
    if (error) throw error;
    return (data as { note: string }[]).map((r) => r.note);
  }
  async recaps() {
    const { data, error } = await this.db
      .from("sidecar_sessions")
      .select("id, created_at, problem_title, subject, gap, result")
      .not("result", "is", null)
      .order("created_at", { ascending: false })
      .limit(MAX_RECAPS);
    if (error) throw error;
    return (data as { id: string; created_at: string; problem_title: string; subject: string; gap: string; result: string }[]).map((r) => ({
      id: r.id,
      date: r.created_at,
      title: r.problem_title,
      subject: r.subject,
      gap: r.gap,
      result: r.result,
    }));
  }
  async recordSession(r: SessionRecord) {
    const { error } = await this.db.rpc("sidecar_record_session", {
      p_id: r.id,
      p_title: r.title ?? "",
      p_subject: r.subject ?? "",
      p_gap: r.gap ?? "",
      p_slug: r.concept?.slug ?? null,
      p_label: r.concept?.label ?? "",
      p_event: r.concept ? r.event ?? null : null,
      p_result: r.result ?? null,
    });
    if (error) throw error;
  }
  async addNote(note: string) {
    const clean = cleanNote(note);
    if (clean.length < 4) return null;
    const existing = await this.notes();
    if (existing.some((n) => noteKey(n) === noteKey(clean))) return null;
    const { error } = await this.db.from("sidecar_learner_notes").insert({ user_id: this.userId, note: clean });
    if (error) return null; // duplicate under a different spelling: not new
    // Keep only the newest MAX_NOTES on the server too.
    const { data } = await this.db.from("sidecar_learner_notes").select("id").order("created_at", { ascending: false }).range(MAX_NOTES, 100);
    if (data?.length) await this.db.from("sidecar_learner_notes").delete().in("id", data.map((d) => d.id));
    return [clean, ...existing].slice(0, MAX_NOTES);
  }
  async forgetNotes() {
    const { error } = await this.db.from("sidecar_learner_notes").delete().eq("user_id", this.userId);
    if (error) throw error;
  }
  async forget() {
    for (const t of ["sidecar_concepts", "sidecar_sessions", "sidecar_learner_notes"]) {
      const { error } = await this.db.from(t).delete().eq("user_id", this.userId);
      if (error) throw error;
    }
  }

  /**
   * First sign-in: bring this browser's guest memory into the account, then clear it locally.
   * Safe to run again after a failure: concepts already in the account are left alone (never
   * re-added), recaps keep fixed ids, notes dedupe. Local data is cleared only after every step worked.
   */
  async importLocal(local: LocalMemory) {
    const [concepts, notes, recaps] = await Promise.all([local.concepts(), local.notes(), local.recapsWithIds()]);
    if (!concepts.length && !notes.length && !recaps.length) return false;
    if (concepts.length) {
      const existing = new Set((await this.concepts()).map((c) => c.slug));
      const rows = concepts
        .filter((c) => !existing.has(c.slug))
        .map((c) => ({
          user_id: this.userId,
          slug: c.slug,
          label: c.label.slice(0, 120),
          subject: c.subject.slice(0, 60),
          misses: c.misses,
          hits: c.hits,
          step: c.step,
          next_review_at: c.nextReviewAt,
          last_seen_at: c.lastSeenAt,
        }));
      if (rows.length) {
        const { error } = await this.db.from("sidecar_concepts").upsert(rows, { onConflict: "user_id,slug", ignoreDuplicates: true });
        if (error) throw error;
      }
    }
    const have = new Set((await this.notes()).map(noteKey));
    for (const n of [...notes].reverse()) {
      const clean = cleanNote(n);
      if (clean.length < 4 || have.has(noteKey(clean))) continue;
      const { error } = await this.db.from("sidecar_learner_notes").insert({ user_id: this.userId, note: clean });
      if (error && error.code !== "23505") throw error; // 23505 = already there
      have.add(noteKey(clean));
    }
    if (recaps.length) {
      const rows = recaps.map((r) => ({
        id: r.id as string,
        user_id: this.userId,
        problem_title: r.title.slice(0, 200),
        subject: r.subject.slice(0, 60),
        gap: r.gap.slice(0, 200),
        result: r.result.slice(0, 80),
        created_at: r.date,
      }));
      const { error } = await this.db.from("sidecar_sessions").upsert(rows, { onConflict: "id", ignoreDuplicates: true });
      if (error) throw error;
    }
    await local.forget();
    return true;
  }
}
