// Canvas LMS: the student's own personal access token, encrypted at rest, used only from
// the server (Canvas's API has no CORS). Every Canvas host is checked so a pasted URL can't
// point our server at something internal.

import { createCipheriv, createDecipheriv, randomBytes } from "node:crypto";
import { lookup as dnsLookup } from "node:dns/promises";
import { request } from "node:https";
import { BlockList, isIP, type LookupFunction } from "node:net";

// ---------------------------------------------------------------- token encryption

function keyBytes(keyB64: string): Buffer {
  const k = Buffer.from(keyB64, "base64");
  if (k.length !== 32) throw new Error("CANVAS_TOKEN_KEY must be 32 bytes, base64-encoded (openssl rand -base64 32).");
  return k;
}

/** AES-256-GCM, bound to its owner (user id as associated data). Output: "v1:" + base64(iv | tag | ciphertext). */
export function encryptToken(token: string, keyB64: string, owner: string): string {
  const iv = randomBytes(12);
  const c = createCipheriv("aes-256-gcm", keyBytes(keyB64), iv);
  c.setAAD(Buffer.from(owner, "utf8"));
  const ct = Buffer.concat([c.update(token, "utf8"), c.final()]);
  return "v1:" + Buffer.concat([iv, c.getAuthTag(), ct]).toString("base64");
}

export function decryptToken(box: string, keyB64: string, owner: string): string {
  if (!box.startsWith("v1:")) throw new Error("Unknown token format");
  const raw = Buffer.from(box.slice(3), "base64");
  const d = createDecipheriv("aes-256-gcm", keyBytes(keyB64), raw.subarray(0, 12));
  d.setAAD(Buffer.from(owner, "utf8"));
  d.setAuthTag(raw.subarray(12, 28));
  return Buffer.concat([d.update(raw.subarray(28)), d.final()]).toString("utf8");
}

// ---------------------------------------------------------------- SSRF guard

type Lookup = (host: string) => Promise<string[]>;
const defaultLookup: Lookup = async (host) => (await dnsLookup(host, { all: true })).map((a) => a.address);

// Everything that isn't plain public unicast. IPv6 forms that can carry an IPv4 address
// (mapped, compatible, NAT64, 6to4) are blocked wholesale: no Canvas host needs them.
// Two lists: a single BlockList also matches IPv4 addresses against IPv6 rules (via ::ffff:a.b.c.d),
// so blocking the mapped range there would block every IPv4 address.
const blocked4 = new BlockList();
const blocked6 = new BlockList();
for (const [net, bits] of [["0.0.0.0", 8], ["10.0.0.0", 8], ["100.64.0.0", 10], ["127.0.0.0", 8], ["169.254.0.0", 16], ["172.16.0.0", 12], ["192.0.0.0", 24], ["192.0.2.0", 24], ["192.168.0.0", 16], ["198.18.0.0", 15], ["198.51.100.0", 24], ["203.0.113.0", 24], ["224.0.0.0", 3]] as const)
  blocked4.addSubnet(net, bits, "ipv4");
for (const [net, bits] of [["::", 96], ["::ffff:0:0", 96], ["64:ff9b::", 96], ["64:ff9b:1::", 48], ["100::", 64], ["2001:db8::", 32], ["2002::", 16], ["fc00::", 7], ["fe80::", 10], ["fec0::", 10], ["ff00::", 8]] as const)
  blocked6.addSubnet(net, bits, "ipv6");

export function isPrivate(ip: string): boolean {
  const v = isIP(ip);
  if (!v) return true;
  return v === 4 ? blocked4.check(ip, "ipv4") : blocked6.check(ip, "ipv6");
}

export class CanvasError extends Error {
  constructor(message: string, public status = 400, public code = "canvas_error") {
    super(message);
  }
}

/** Returns the normalized origin ("https://canvas.school.edu") or throws. canvasGet re-checks at connect time. */
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

/**
 * DNS lookup used for the actual connection: the address we connect to is the one we checked,
 * so a DNS answer that flips to an internal address after assertSafeBaseUrl (rebinding) is refused.
 */
const safeLookup: LookupFunction = (hostname, options, callback) => {
  dnsLookup(hostname, { all: true }).then(
    (addrs) => {
      if (!addrs.length || addrs.some((a) => isPrivate(a.address))) return callback(Object.assign(new Error("blocked address"), { code: "EBLOCKED" }), "", 4);
      if (options.all) (callback as unknown as (e: null, a: typeof addrs) => void)(null, addrs);
      else callback(null, addrs[0].address, addrs[0].family);
    },
    (err) => callback(err, "", 4),
  );
};

const MAX_BODY = 5_000_000;

/** GET over https with the connect-time address check. Never follows redirects. */
function httpsGet(url: string, token: string): Promise<{ status: number; body: string }> {
  return new Promise((resolve, reject) => {
    const req = request(url, { method: "GET", lookup: safeLookup, timeout: 15_000, headers: { Authorization: `Bearer ${token}`, Accept: "application/json" } }, (res) => {
      let size = 0;
      const chunks: Buffer[] = [];
      res.on("data", (c: Buffer) => {
        size += c.length;
        if (size > MAX_BODY) req.destroy(new Error("response too large"));
        else chunks.push(c);
      });
      res.on("end", () => resolve({ status: res.statusCode ?? 0, body: Buffer.concat(chunks).toString("utf8") }));
      res.on("error", reject);
    });
    req.on("timeout", () => req.destroy(new Error("timeout")));
    req.on("error", reject);
    req.end();
  });
}

export async function canvasGet<T>(base: string, token: string, path: string): Promise<T> {
  const origin = await assertSafeBaseUrl(base);
  let res: { status: number; body: string };
  try {
    res = await httpsGet(origin + path, token);
  } catch {
    throw new CanvasError("Canvas didn't answer. Check the address, or try again in a minute.", 502, "unreachable");
  }
  if (res.status >= 300 && res.status < 400) throw new CanvasError("Canvas tried to send us somewhere else. Check the address (it should be your school's Canvas site).", 502, "redirect");
  if (res.status === 401) throw new CanvasError("Canvas didn't accept your token (it may have expired). Reconnect Canvas with a new token.", 401, "token_rejected");
  if (res.status === 403 || res.status === 404) throw new CanvasError("Canvas wouldn't share that. It may be locked or unpublished, or turned off at your school.", 404, "not_found");
  if (res.status < 200 || res.status >= 300) throw new CanvasError(`Canvas had a problem (error ${res.status}). Try again in a minute.`, 502, "upstream");
  try {
    return JSON.parse(res.body) as T;
  } catch {
    throw new CanvasError("That doesn't look like a Canvas site. Check the address.", 502, "not_canvas");
  }
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
