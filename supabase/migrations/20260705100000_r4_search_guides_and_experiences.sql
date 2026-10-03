-- R4 (design doc D-R4-1): full-text search over guides and experiences, mirroring the
-- existing search_articles() shape exactly (websearch_to_tsquery over a precomputed
-- tsvector, SECURITY INVOKER so anon only ever sees rows the existing RLS already
-- allows). Both tables get a `generated always as (...) stored` tsvector column —
-- Postgres 17 (this project's live version) supports this natively, no trigger needed.

alter table public.guides add column tsv tsvector generated always as (
  to_tsvector('simple', coalesce(title, '') || ' ' || coalesce(summary, '') || ' ' || coalesce(city, ''))
) stored;

create index guides_tsv_idx on public.guides using gin(tsv);

alter table public.experiences add column tsv tsvector generated always as (
  to_tsvector('simple',
    coalesce(title, '') || ' ' || coalesce(summary, '') || ' ' || coalesce(description, '') || ' ' || coalesce(city, ''))
) stored;

create index experiences_tsv_idx on public.experiences using gin(tsv);

create or replace function public.search_guides(
  p_q      text default null,
  p_city   text default null,
  p_limit  int  default 12,
  p_offset int  default 0
)
returns table (
  slug text, title text, summary text, city text, cover_url text,
  saves_count integer, creator_handle text, published_at timestamptz, total_count bigint
)
language sql stable security invoker set search_path = public as $$
  with base as (
    select g.slug, g.title, g.summary, g.city, g.cover_url, g.saves_count, g.creator_handle, g.published_at
    from public.guides g
    where g.status = 'published'
      and (p_city is null or p_city = '' or g.city ilike '%' || p_city || '%')
      and (
        p_q is null or p_q = ''
        or g.tsv @@ websearch_to_tsquery('simple', p_q)
        or g.title ilike '%' || p_q || '%'
      )
  )
  select slug, title, summary, city, cover_url, saves_count, creator_handle, published_at,
         count(*) over () as total_count
  from base
  order by published_at desc, slug asc
  limit p_limit offset p_offset;
$$;

grant execute on function public.search_guides(text, text, int, int) to anon, authenticated;

-- search_experiences uses app_private.merchant_is_active() (added in
-- 20260704100000_fix_experiences_public_read_merchant_check.sql) rather than a raw
-- subquery on public.merchant_profiles: anon has zero table grant on merchant_profiles
-- (revoked in 20260617173941_mission_grants.sql), so a direct `exists (select ... from
-- public.merchant_profiles ...)` here would raise "permission denied for table
-- merchant_profiles" for anon callers — the exact bug that fix migration addressed for
-- the experiences_public_read RLS policy. The SECURITY DEFINER helper avoids that.
create or replace function public.search_experiences(
  p_q      text default null,
  p_city   text default null,
  p_limit  int  default 12,
  p_offset int  default 0
)
returns table (
  slug text, title text, summary text, city text, price_amount numeric, currency text,
  cover_url text, merchant_profile_id uuid, published_at timestamptz, total_count bigint
)
language sql stable security invoker set search_path = public as $$
  with base as (
    select e.slug, e.title, e.summary, e.city, e.price_amount, e.currency, e.cover_url,
           e.merchant_profile_id, e.published_at
    from public.experiences e
    where e.status = 'published'
      and app_private.merchant_is_active(e.merchant_profile_id)
      and (p_city is null or p_city = '' or e.city ilike '%' || p_city || '%')
      and (
        p_q is null or p_q = ''
        or e.tsv @@ websearch_to_tsquery('simple', p_q)
        or e.title ilike '%' || p_q || '%'
      )
  )
  select slug, title, summary, city, price_amount, currency, cover_url, merchant_profile_id, published_at,
         count(*) over () as total_count
  from base
  order by published_at desc, slug asc
  limit p_limit offset p_offset;
$$;

grant execute on function public.search_experiences(text, text, int, int) to anon, authenticated;
