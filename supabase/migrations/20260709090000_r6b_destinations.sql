-- supabase/migrations/20260709090000_r6b_destinations.sql
-- Phase R6B — ops-curated destinations table (D-R6B-2). Public SELECT of published rows
-- only; no insert/update/delete grant to anon/authenticated at all (D-R6B-4 — ops writes
-- directly via the Supabase table editor / service_role, same zero-write-grant shape as
-- booking_events / mission_verification_jobs — see supabase-default-acl-gotcha for why the
-- grant must be explicit rather than assumed).

create table public.destinations (
  id uuid primary key default gen_random_uuid(),
  slug text not null unique,
  name text not null,
  hero_image_url text,
  description text,
  match_terms text[] not null default '{}',
  sort_order integer not null default 0,
  status text not null default 'draft' check (status in ('draft','published')),
  published_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index destinations_status_sort_idx on public.destinations (status, sort_order);

create trigger destinations_set_updated_at
  before update on public.destinations
  for each row execute function public.set_updated_at();

alter table public.destinations enable row level security;
revoke all on public.destinations from anon, authenticated;

create policy destinations_public_read on public.destinations
  for select to anon, authenticated using (status = 'published');

-- No insert/update/delete policy for any role — ops writes directly via the
-- Supabase table editor / service_role only (D-R6B-4; no admin CRUD this phase).
grant select on public.destinations to anon, authenticated;

-- Supports the community_sessions.destination_tags && match_terms aggregate query used by
-- getSessionsForDestination (Task 4) — no index existed on this array column before this.
create index community_sessions_destination_tags_idx
  on public.community_sessions using gin (destination_tags);
