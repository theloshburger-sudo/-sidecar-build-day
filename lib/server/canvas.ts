// Canvas LMS: the student's own personal access token, encrypted at rest, used only from
// the server (Canvas's API has no CORS). Every Canvas host is checked so a pasted URL can't
// point our server at something internal.

import { createCipheriv, createDecipheriv, randomBytes } from "node:crypto";
import { lookup as dnsLookup } from "node:dns/promises";
import { isIP } from "node:net";

// ---------------------------------------------------------------- token encryption

function keyBytes(keyB64: string): Buffer {
  const k = Buffer.from(keyB64, "base64");
  if (k.length !== 32) throw new Error("CANVAS_TOKEN_KEY must be 32 bytes, base64-encoded (openssl rand -base64 32).");
  return k;
}

/** AES-256-GCM. Output: "v1:" + base64(iv | tag | ciphertext). */
export function encryptToken(token: string, keyB64: string): string {
  const iv = randomBytes(12);
  const c = createCipheriv("aes-256-gcm", keyBytes(keyB64), iv);
  const ct = Buffer.concat([c.update(token, "utf8"), c.final()]);
  return "v1:" + Buffer.concat([iv, c.getAuthTag(), ct]).toString("base64");
}

export function decryptToken(box: string, keyB64: string): string {
  if (!box.startsWith("v1:")) throw new Error("Unknown token format");
  const raw = Buffer.from(box.slice(3), "base64");
  const d = createDecipheriv("aes-256-gcm", keyBytes(keyB64), raw.subarray(0, 12));
  d.setAuthTag(raw.subarray(12, 28));
  return Buffer.concat([d.update(raw.subarray(28)), d.final()]).toString("utf8");
}

// ---------------------------------------------------------------- SSRF guard

type Lookup = (host: string) => Promise<string[]>;
const defaultLookup: Lookup = async (host) => (await dnsLookup(host, { all: true })).map((a) => a.address);

function isPrivate(ip: string): boolean {
  const v4 = ip.startsWith("::ffff:") ? ip.slice(7) : ip;
  if (isIP(v4) === 4) {
    const [a, b] = v4.split(".").map(Number);
    return a === 0 || a === 10 || a === 127 || (a === 100 && b >= 64 && b <= 127) || (a === 169 && b === 254) || (a === 172 && b >= 16 && b <= 31) || (a === 192 && b === 168) || a >= 224;
  }
  const s = ip.toLowerCase();
  return s === "::" || s === "::1" || s.startsWith("fc") || s.startsWith("fd") || s.startsWith("fe8") || s.startsWith("fe9") || s.startsWith("fea") || s.startsWith("feb");
}

export class CanvasError extends Error {
  constructor(message: string, public status = 400, public code = "canvas_error") {
    super(message);
  }
}

/**
 * Returns the normalized origin ("https://canvas.school.edu") or throws.
 * ponytail: checked again before every request, but a DNS answer can still change between the check
 * and the fetch (rebinding). Pin the resolved IP with a custom agent if this ever faces untrusted volume.
 */
export async function assertSafeBaseUrl(raw: string, lookup: Lookup = defaultLookup): Promise<string> {
  const bad = (why: string) => new CanvasError(`That Canvas address won't work: ${why}. It should look like https://canvas.yourschool.edu`, 400, "bad_url");
  let u: URL;
  try {
    u = new URL(/^[a-z]+:\/\//i.test(raw.trim()) ? raw.trim() : `https://${raw.trim()}`);
  } catch {
    throw bad("it isn't a web address");
  }
  if (u.protocol !== "https:") throw bad("it must start with https");
  if (u.username || u.password) throw bad("it can't contain a username or password");
  if (u.port) throw bad("it can't use a custom port");
  const host = u.hostname.replace(/^\[|\]$/g, "").toLowerCase();
  if (isIP(host) || host === "localhost" || !host.includes(".") || /\.(local|internal|localhost)$/.test(host)) throw bad("it must be your school's Canvas site");
  let addrs: string[];
  try {
    addrs = await lookup(host);
  } catch {
    throw bad("we couldn't find that site");
  }
  if (!addrs.length || addrs.some(isPrivate)) throw bad("it must be a public site");
  return `https://${host}`;
}

// ---------------------------------------------------------------- API calls

export async function canvasGet<T>(base: string, token: string, path: string): Promise<T> {
  const origin = await assertSafeBaseUrl(base);
  let res: Response;
  try {
    res = await fetch(origin + path, {
      headers: { Authorization: `Bearer ${token}`, Accept: "application/json" },
      redirect: "error", // never follow Canvas somewhere else
      signal: AbortSignal.timeout(15_000),
      cache: "no-store",
    });
  } catch {
    throw new CanvasError("Canvas didn't answer. Check the address, or try again in a minute.", 502, "unreachable");
  }
  if (res.status === 401) throw new CanvasError("Canvas didn't accept your token (it may have expired). Reconnect Canvas with a new token.", 401, "token_rejected");
  if (res.status === 403 || res.status === 404) throw new CanvasError("Canvas wouldn't show that assignment. It may be locked or unpublished.", 404, "not_found");
  if (!res.ok) throw new CanvasError(`Canvas had a problem (error ${res.status}). Try again in a minute.`, 502, "upstream");
  return (await res.json()) as T;
}

export interface CanvasItem {
  courseId: number;
  courseName: string;
  assignmentId: number;
  name: string;
  dueAt: string | null;
  url: string;
  kind: "assignment" | "quiz";
}

interface PlannerItem {
  plannable_type?: string;
  course_id?: number;
  context_name?: string;
  plannable_id?: number;
  plannable?: { title?: string; due_at?: string | null; assignment_id?: number };
  html_url?: string;
  submissions?: { submitted?: boolean } | false;
}

/** Unsubmitted assignments and quizzes, soonest first. */
export function mapPlanner(items: PlannerItem[], base: string): CanvasItem[] {
  const out: CanvasItem[] = [];
  for (const it of Array.isArray(items) ? items : []) {
    if (it.submissions && it.submissions.submitted) continue;
    const kind = it.plannable_type === "assignment" ? "assignment" : it.plannable_type === "quiz" ? "quiz" : null;
    const assignmentId = kind === "assignment" ? it.plannable_id : kind === "quiz" ? it.plannable?.assignment_id : undefined;
    if (!kind || !assignmentId || !it.course_id) continue;
    const href = it.html_url ?? "";
    out.push({
      courseId: it.course_id,
      courseName: (it.context_name ?? "").slice(0, 80),
      assignmentId,
      name: (it.plannable?.title ?? "Assignment").slice(0, 160),
      dueAt: it.plannable?.due_at ?? null,
      url: href.startsWith("http") ? href : base + href,
      kind,
    });
  }
  return out.sort((a, b) => (a.dueAt ?? "9").localeCompare(b.dueAt ?? "9"));
}

// ---------------------------------------------------------------- assignment text

const ENTITIES: Record<string, string> = {
  amp: "&", lt: "<", gt: ">", quot: '"', apos: "'", nbsp: " ", sup2: "²", sup3: "³", times: "×", divide: "÷",
  minus: "−", le: "≤", ge: "≥", ne: "≠", pi: "π", deg: "°", plusmn: "±", frac12: "½", rarr: "→", hellip: "…",
  ndash: "–", mdash: "—", lsquo: "‘", rsquo: "’", ldquo: "“", rdquo: "”",
};

const decode = (s: string) =>
  s.replace(/&(#x[0-9a-f]+|#\d+|[a-z0-9]+);/gi, (m, e: string) => {
    if (e[0] === "#") {
      const n = e[1].toLowerCase() === "x" ? parseInt(e.slice(2), 16) : parseInt(e.slice(1), 10);
      return Number.isFinite(n) && n > 0 && n < 0x110000 ? String.fromCodePoint(n) : "";
    }
    return ENTITIES[e.toLowerCase()] ?? m;
  });

/** Canvas assignment HTML → plain text a tutor can read (numbered lists kept, math images → their LaTeX). */
export function htmlToText(html: string): string {
  let s = (html ?? "").slice(0, 200_000);
  s = s.replace(/<(script|style|iframe|object)[\s\S]*?<\/\1>/gi, "");
  // Canvas equation images carry their source: data-equation-content="x^2" (or alt="LaTeX: x^2").
  s = s.replace(/<img\b[^>]*>/gi, (tag) => {
    const eq = /data-equation-content="([^"]*)"/i.exec(tag)?.[1] ?? /alt="(?:LaTeX:\s*)?([^"]*)"/i.exec(tag)?.[1];
    return eq ? ` ${eq} ` : "";
  });
  s = s.replace(/<ol\b[^>]*>([\s\S]*?)<\/ol>/gi, (_m, inner: string) => {
    let i = 0;
    return "\n" + inner.replace(/<li\b[^>]*>/gi, () => `\n${++i}. `) + "\n";
  });
  s = s.replace(/<li\b[^>]*>/gi, "\n• ");
  s = s.replace(/<br\s*\/?>/gi, "\n").replace(/<\/(p|div|h[1-6]|tr|li|ul|table|blockquote)>/gi, "\n").replace(/<(td|th)\b[^>]*>/gi, " | ");
  s = decode(s.replace(/<[^>]+>/g, ""));
  return s
    .replace(/[ \t ]+/g, " ")
    .replace(/ *\n */g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}
