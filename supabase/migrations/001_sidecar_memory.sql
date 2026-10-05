-- Sidecar gap memory. Additive only: every object is prefixed sidecar_ so it can live
-- next to other apps in a shared project. Access is row-level: you only ever see your rows.

create table if not exists public.sidecar_concepts (
  user_id uuid not null references auth.users (id) on delete cascade,
  slug text not null check (char_length(slug) between 1 and 40),
  label text not null default '' check (char_length(label) <= 120),
  subject text not null default '' check (char_length(subject) <= 60),
  misses int not null default 0,
  hits int not null default 0,
  step int not null default 0,
  next_review_at timestamptz,
  last_seen_at timestamptz not null default now(),
  primary key (user_id, slug)
);

create table if not exists public.sidecar_sessions (
  id uuid primary key,
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  problem_title text not null default '' check (char_length(problem_title) <= 200),
  subject text not null default '' check (char_length(subject) <= 60),
  gap text not null default '' check (char_length(gap) <= 200),
  concept_slug text,
  event text check (event in ('miss', 'hit')),
  result text check (char_length(result) <= 80),
  created_at timestamptz not null default now()
);
create index if not exists sidecar_sessions_user_created on public.sidecar_sessions (user_id, created_at desc);

create table if not exists public.sidecar_learner_notes (
  id bigint generated always as identity primary key,
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  note text not null check (char_length(note) between 4 and 120),
  created_at timestamptz not null default now()
);
create unique index if not exists sidecar_learner_notes_unique on public.sidecar_learner_notes (user_id, lower(note));

alter table public.sidecar_concepts enable row level security;
alter table public.sidecar_sessions enable row level security;
alter table public.sidecar_learner_notes enable row level security;

do $$
declare t text;
begin
  foreach t in array array['sidecar_concepts', 'sidecar_sessions', 'sidecar_learner_notes'] loop
    execute format('drop policy if exists own_rows on public.%I', t);
    execute format(
      'create policy own_rows on public.%I for all to authenticated using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()))',
      t);
    execute format('revoke all on public.%I from anon', t);
    execute format('grant select, insert, update, delete on public.%I to authenticated', t);
  end loop;
end $$;

-- One call per session event. The first event recorded for a session id is the only one
-- that moves the concept's schedule, so retries and double clicks never double-count.
-- Mirrors lib/review.ts (intervals 2, 7, 21, 60 days; step 4 = mastered).
create or replace function public.sidecar_record_session(
  p_id uuid,
  p_title text default '',
  p_subject text default '',
  p_gap text default '',
  p_slug text default null,
  p_label text default '',
  p_event text default null,
  p_result text default null
) returns void
language plpgsql
security invoker
set search_path = ''
as $$
declare
  uid uuid := auth.uid();
  prior_event text;
  intervals int[] := array[2, 7, 21, 60];
begin
  if uid is null then
    raise exception 'not signed in';
  end if;
  if p_event is not null and p_event not in ('miss', 'hit') then
    raise exception 'bad event';
  end if;

  select s.event into prior_event from public.sidecar_sessions s where s.id = p_id and s.user_id = uid for update;

  insert into public.sidecar_sessions as s (id, user_id, problem_title, subject, gap, concept_slug, event, result)
  values (p_id, uid, left(coalesce(p_title, ''), 200), left(coalesce(p_subject, ''), 60), left(coalesce(p_gap, ''), 200), p_slug, p_event, left(p_result, 80))
  on conflict (id) do update set
    problem_title = coalesce(nullif(excluded.problem_title, ''), s.problem_title),
    subject = coalesce(nullif(excluded.subject, ''), s.subject),
    gap = coalesce(nullif(excluded.gap, ''), s.gap),
    concept_slug = coalesce(s.concept_slug, excluded.concept_slug),
    event = coalesce(s.event, excluded.event),
    result = coalesce(excluded.result, s.result)
  where s.user_id = uid;

  if p_slug is null or p_event is null or prior_event is not null then
    return;
  end if;

  insert into public.sidecar_concepts as c (user_id, slug, label, subject, misses, hits, step, next_review_at, last_seen_at)
  values (
    uid, p_slug, left(coalesce(p_label, ''), 120), left(coalesce(p_subject, ''), 60),
    case when p_event = 'miss' then 1 else 0 end,
    case when p_event = 'hit' then 1 else 0 end,
    case when p_event = 'hit' then 1 else 0 end,
    now() + make_interval(days => intervals[case when p_event = 'hit' then 2 else 1 end]),
    now()
  )
  on conflict (user_id, slug) do update set
    label = coalesce(nullif(excluded.label, ''), c.label),
    subject = coalesce(nullif(excluded.subject, ''), c.subject),
    misses = c.misses + case when p_event = 'miss' then 1 else 0 end,
    hits = c.hits + case when p_event = 'hit' then 1 else 0 end,
    step = case when p_event = 'miss' then 0 else least(c.step + 1, 4) end,
    next_review_at = case
      when p_event = 'miss' then now() + make_interval(days => intervals[1])
      when c.step + 1 >= 4 then null
      else now() + make_interval(days => intervals[c.step + 2])
    end,
    last_seen_at = now();
end;
$$;

revoke all on function public.sidecar_record_session(uuid, text, text, text, text, text, text, text) from public, anon;
grant execute on function public.sidecar_record_session(uuid, text, text, text, text, text, text, text) to authenticated;
