-- supabase/migrations/20260712100000_r6c_article_cross_link_overrides.sql
-- Phase R6C — editorial override tables for article cross-links (D-R6C-2). Force-add
-- only (D-R6C-1): a row here always shows a specific guide/experience on a specific
-- article, ahead of and merged with the heuristic city-ILIKE matches. No admin UI this
-- phase (D-R6C-3) — ops writes directly via the Supabase table editor / service_role
-- only, same zero-write-grant shape as destinations (20260709090000_r6b_destinations.sql).

create table public.article_guide_overrides (
  id uuid primary key default gen_random_uuid(),
  article_id uuid not null references public.articles(id) on delete cascade,
  guide_id uuid not null references public.guides(id) on delete cascade,
  sort_order integer not null default 0,
  created_at timestamptz not null default now(),
  unique(article_id, guide_id)
);

create index article_guide_overrides_article_idx on public.article_guide_overrides (article_id, sort_order);

alter table public.article_guide_overrides enable row level security;
revoke all on public.article_guide_overrides from anon, authenticated;

create policy article_guide_overrides_public_read on public.article_guide_overrides
  for select to anon, authenticated using (true);

-- No insert/update/delete policy for any role — ops writes directly via the
-- Supabase table editor / service_role only (D-R6C-3; no admin UI this phase).
grant select on public.article_guide_overrides to anon, authenticated;

create table public.article_experience_overrides (
  id uuid primary key default gen_random_uuid(),
  article_id uuid not null references public.articles(id) on delete cascade,
  experience_id uuid not null references public.experiences(id) on delete cascade,
  sort_order integer not null default 0,
  created_at timestamptz not null default now(),
  unique(article_id, experience_id)
);

create index article_experience_overrides_article_idx on public.article_experience_overrides (article_id, sort_order);

alter table public.article_experience_overrides enable row level security;
revoke all on public.article_experience_overrides from anon, authenticated;

create policy article_experience_overrides_public_read on public.article_experience_overrides
  for select to anon, authenticated using (true);

grant select on public.article_experience_overrides to anon, authenticated;
