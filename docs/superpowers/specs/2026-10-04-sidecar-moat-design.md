# Sidecar: memory, Canvas, screen-follow — design

**Goal.** Sidecar becomes a real product for students: a tutor that sits beside you
on your exact homework, like HeyClicky, but with an advantage HeyClicky's
general-purpose Mac buddy can't copy: **it knows your courses (Canvas), it knows
your weak spots across the semester (gap memory with spaced review), and it can
teach on whatever you're looking at (screen-follow), in any browser on any device.**

**Hard constraints**
- Guests keep today's experience: no account, everything on-device.
- No paid services are added. Supabase reuses the free project `portfolio-intro-desk`
  (all objects prefixed `sidecar_`). Development tests use the local mock Anthropic server.
- The offline demo lessons are unchanged and never write to memory.

Built in order: 1 → 2 → 3. Each must be usable on its own.

---

## 1. Gap memory + spaced review

### Store: one interface, two backends
`lib/memory.ts` exports `MemoryStore` with `concepts()`, `notes()`, `recaps()`,
`recordSession(rec)`, `addNote(note)`, `forget()`.
- `LocalMemory`: localStorage (guests). Keeps the existing `sidecar.learner.v1` /
  `sidecar.recaps.v1` keys and adds `sidecar.concepts.v1`.
- `CloudMemory`: Supabase (signed in), through `supabase-js` with the public anon key.
  Row-level security is the only access control. There are no memory API routes,
  and no service-role key is used anywhere.
- On first sign-in, local notes, recaps and concepts are imported into the account
  (`importLocal`), then the local copies are cleared.

### Auth
Supabase Auth via `@supabase/supabase-js` in the browser. Sign-in is Google OAuth
or an email magic link. `NEXT_PUBLIC_SUPABASE_URL` and
`NEXT_PUBLIC_SUPABASE_ANON_KEY` are optional; if either is unset, the sign-in UI is
hidden and everything stays guest-mode. The top bar gets a sign-in button and an
account menu (signed-in email, "Your progress", sign out). Guests are never
prompted mid-lesson.

Manual project setup (dashboard, one time): enable the Google provider (Google
Cloud OAuth client), add the Sidecar URL to Auth → URL Configuration → Redirect
URLs, and optionally set up custom SMTP for magic links (the built-in sender is
heavily rate limited).

### Schema (`supabase/migrations/001_sidecar_memory.sql`, additive only)
| table | columns |
|---|---|
| `sidecar_concepts` | `user_id uuid → auth.users`, `slug text`, `label`, `subject`, `misses int`, `hits int`, `step int`, `next_review_at timestamptz`, `last_seen_at`; PK `(user_id, slug)` |
| `sidecar_sessions` | `id uuid` (client-generated), `user_id`, `problem_title`, `subject`, `concept_slug`, `result`, `created_at` |
| `sidecar_learner_notes` | `user_id`, `note`, `created_at`; unique `(user_id, lower(note))` |

RLS on all three tables: `user_id = auth.uid()` for select/insert/update/delete,
granted to the `authenticated` role only. The problem text is never stored, only its title.

`sidecar_record_session(p_id, p_title, p_subject, p_slug, p_label, p_event, p_result)`
is a `security invoker` function. It upserts the session row and applies one
concept event atomically. The concept is touched only when the session row is
first created or when the event changes, so a repeated call never double-counts.

### Spacing rules (`lib/review.ts`, pure, unit-tested)
`INTERVALS = [2, 7, 21, 60]` days. Events:
- `miss` (gap found in diagnosis; warm-up incorrect or partial): `misses+1`, step 0, due in 2 days.
- `hit` (warm-up correct): `hits+1`, step+1, due in `INTERVALS[step]`. Once step reaches 4, the concept is **mastered** (no due date).
- Solving the practice problem in the same session changes only the session result, never the schedule.

`dueConcept(concepts, subject, now)` returns the most overdue concept in the same
subject, otherwise the most overdue overall, otherwise null.

### Tutor changes
- `TutorTurn.concept: { slug, label }`, set together with `gap`, otherwise empty.
  It's added to the schema's required list, the prompted-format line, `normalizeTurn`
  (slug sanitized to kebab-case, at most 40 chars), and the demo engine (always empty).
- `Phase` gains `"warmup"`.
- `TutorRequest.concepts` (at most 30 `{slug,label}`) and `TutorRequest.review`
  (one `{slug,label}` or absent) go into the **first user message**, so the cached
  system prompt is unchanged.
- Prompt rules: reuse a known slug when it's the same idea. When `review` is set, the
  first turn is phase `warmup`: ONE quick question on that concept, graded next turn
  with `verdict`, then a one-line fix if wrong, then the normal diagnose turn on the
  real problem. Never a mini-lesson.
- Skip button on a warm-up: sends "Skip the warm-up", records nothing, and Teacher moves on.

### UI
- Session: when a concept is first set, call `recordSession(miss)`. When the
  warm-up is graded, record a hit or miss for the review concept. At wrap-up,
  record the session result. The 🧠 chip reads from the store.
- Home: a **"Your weak spots"** panel (signed in or guest, if there is any data) lists
  concepts due now (with a "Review" button that starts a tiny session on that concept),
  then the others with ✓ hits / ✗ misses and the next review date. Mastered concepts are
  collapsed. Recaps come from the store.
- Recap screen: the guest nudge reads "Sign in to keep your progress on every device", only if auth is configured.

### Privacy
- Notes stay "learning habits only" (existing prompt rule). "Forget everything" in the
  account menu deletes all of the user's `sidecar_*` rows.
- Guest data never leaves the device.

---

## 2. Canvas integration

- Canvas has no institution OAuth key available to us, so the student pastes their
  Canvas URL (e.g. `https://canvas.calpoly.edu`) and a **personal access token**
  (Account → Settings → New access token). The UI includes these exact steps.
- Signed in only. The token is stored server-side, encrypted with AES-256-GCM
  (`CANVAS_TOKEN_KEY`, 32-byte base64), in `sidecar_canvas_links (user_id PK, base_url,
  token_ciphertext, created_at)`. RLS allows select/delete own row only. Writes happen in
  `/api/canvas/link` using the caller's own JWT plus a `security definer` function
  `sidecar_set_canvas_link`, which writes only for `auth.uid()`. The browser never reads the token back.
- Canvas's API has no CORS, so all calls go through Next.js routes that forward the
  user's Supabase JWT. `lib/server/canvas.ts`:
  - `assertSafeBaseUrl`: https only, no IP-literal hosts, no localhost, and DNS must not resolve to private, loopback or link-local ranges (SSRF guard).
  - `GET /api/canvas/todo`: upcoming assignments for the next 14 days plus anything overdue in the last 7 (`/api/v1/users/self/todo` + `/planner/items`), mapped to `{courseName, assignmentId, courseId, name, dueAt, url}`.
  - `GET /api/canvas/assignment?course=&id=`: assignment description HTML converted to text, run through the existing extraction prompt (`/api/extract` logic, reused as a function), returns an `Assignment`.
  - `DELETE /api/canvas/link`: disconnect.
- Home (signed in, linked): a **"Due soon from Canvas"** list sorted by due date, with a
  "Work on this" button that opens the problem picker. Each row shows a weak-spot badge
  when the course matches a subject with due concepts.
- Errors: 401 from Canvas means "Your Canvas token expired; reconnect". The link row is kept.

## 3. Screen-follow

- Session gets a **"Share screen"** button (desktop browsers with `getDisplayMedia`;
  hidden elsewhere). Home also gets "Help with what's on my screen", which starts a session
  with the problem "Whatever I'm showing on my shared screen".
- While sharing, each message the student sends attaches a fresh frame (video → canvas,
  max 1280 px wide, JPEG 0.75) as a new `TutorRequest.screen` field, separate from
  `image` (board ink). The prompt labels it "the student's shared screen".
- New board action `screenMark {kind: circle|arrow|box|label, x, y, x2, y2, text, color}`
  with coordinates on a 0–1000 grid over the screenshot. The session shows the frozen
  frame in a **Screen** panel above the board, and screen marks animate on an SVG overlay
  in step with the narration, just as board actions do. Board actions keep working
  alongside it, so Teacher can point at the screen, then explain on the board.
- Frames are never stored, only sent with that one request. Sharing stops when the session ends.

## Testing
- Unit (`node:test`): `review.ts` schedule and `dueConcept`; `LocalMemory` record,
  import and dedup; `normalizeTurn` concept and screenMark sanitizing; prompt includes
  concepts/review/screen; `assertSafeBaseUrl`; Canvas response mapping; token encrypt/decrypt round trip.
- SQL: migration applied to the shared project; RLS verified with two fake JWT
  subjects via `set local role authenticated` + `request.jwt.claims`.
- Existing e2e scripts must still pass (offline demo, upload, mock-live).
