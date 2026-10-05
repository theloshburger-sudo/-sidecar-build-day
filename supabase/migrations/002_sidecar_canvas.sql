-- Sidecar ↔ Canvas link. The token is AES-256-GCM encrypted by the server (CANVAS_TOKEN_KEY)
-- before it gets here, so the row alone (or a database leak) never reveals it.
create table if not exists public.sidecar_canvas_links (
  user_id uuid primary key default auth.uid() references auth.users (id) on delete cascade,
  base_url text not null check (base_url ~ '^https://[a-z0-9.-]+$'),
  token_ciphertext text not null check (token_ciphertext like 'v1:%' and char_length(token_ciphertext) < 2000),
  created_at timestamptz not null default now()
);
alter table public.sidecar_canvas_links enable row level security;
drop policy if exists own_rows on public.sidecar_canvas_links;
create policy own_rows on public.sidecar_canvas_links for all to authenticated
  using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));
revoke all on public.sidecar_canvas_links from anon;
grant select, insert, update, delete on public.sidecar_canvas_links to authenticated;
