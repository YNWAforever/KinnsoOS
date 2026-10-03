-- R7.5: a read-only destination projection derived from published inventory.
-- A destination cannot be manufactured by curation alone: every row below starts
-- with at least one published guide or experience.
create view public.destination_index
with (security_invoker = true)
as
with published_inventory as (
  select
    'guide'::text as kind,
    btrim(city) as observed_city,
    cover_url as media_url,
    published_at
  from public.guides
  where status = 'published'
    and nullif(btrim(city), '') is not null

  union all

  select
    'experience'::text as kind,
    btrim(city) as observed_city,
    cover_url as media_url,
    published_at
  from public.experiences
  where status = 'published'
    and nullif(btrim(city), '') is not null
),
normalized_inventory as (
  select
    kind,
    observed_city,
    btrim(regexp_replace(lower(observed_city), '[[:punct:][:space:]]+', ' ', 'g')) as city_key,
    media_url,
    published_at
  from published_inventory
),
inventory_rollup as (
  select
    city_key,
    min(observed_city) as observed_name,
    array_agg(distinct observed_city order by observed_city) as observed_spellings,
    count(*) filter (where kind = 'guide') as guide_count,
    count(*) filter (where kind = 'experience') as experience_count,
    (
      array_agg(media_url order by published_at desc nulls last, kind, media_url)
        filter (where media_url is not null)
    )[1] as hero_image_url,
    max(published_at) as latest_published_at,
    coalesce(
      nullif(btrim(regexp_replace(city_key, '[^a-z0-9]+', '-', 'g'), '-'), ''),
      'destination-' || left(md5(city_key), 10)
    ) as generated_slug_base
  from normalized_inventory
  group by city_key
),
inventory_with_slugs as (
  select
    city_key,
    observed_name,
    observed_spellings,
    guide_count,
    experience_count,
    hero_image_url,
    latest_published_at,
    case
      when count(*) over (partition by generated_slug_base) > 1
        then generated_slug_base || '-' || left(md5(city_key), 10)
      else generated_slug_base
    end as generated_slug
  from inventory_rollup
),
published_curated as (
  select
    d.slug,
    d.name,
    d.hero_image_url,
    d.description,
    d.match_terms,
    d.sort_order,
    btrim(regexp_replace(lower(btrim(term.value)), '[[:punct:][:space:]]+', ' ', 'g')) as match_key
  from public.destinations d
  cross join lateral unnest(array_append(d.match_terms, d.name)) as term(value)
  where status = 'published'
),
curated_candidates as (
  select
    i.city_key,
    i.generated_slug,
    c.slug,
    c.name,
    c.hero_image_url,
    c.description,
    c.match_terms,
    c.sort_order,
    row_number() over (
      partition by i.city_key
      order by
        case when c.slug = i.generated_slug then 0 else 1 end,
        c.sort_order,
        c.slug
    ) as city_rank
  from inventory_with_slugs i
  join published_curated c
    on (
      c.slug = i.generated_slug
      or c.match_key = i.city_key
    )
    -- A curated alias must not take a generated slug belonging to another city.
    and not exists (
      select 1
      from inventory_with_slugs other
      where other.generated_slug = c.slug
        and other.city_key <> i.city_key
    )
),
curated_choice as (
  select
    city_key,
    slug,
    name,
    hero_image_url,
    description,
    match_terms,
    sort_order
  from (
    select
      *,
      row_number() over (
        partition by slug
        order by
          case when slug = generated_slug then 0 else 1 end,
          sort_order,
          city_key
      ) as slug_rank
    from curated_candidates
    where city_rank = 1
  ) ranked_candidates
  where slug_rank = 1
)
select
  coalesce(c.slug, i.generated_slug)::text as slug,
  coalesce(c.name, i.observed_name)::text as name,
  coalesce(c.hero_image_url, i.hero_image_url)::text as hero_image_url,
  c.description::text as description,
  (
    select array_agg(distinct btrim(term.value) order by btrim(term.value))
    from unnest(
      coalesce(c.match_terms, '{}'::text[])
      || array[coalesce(c.name, i.observed_name)]
      || i.observed_spellings
    ) as term(value)
    where nullif(btrim(term.value), '') is not null
  )::text[] as match_terms,
  i.guide_count::bigint as guide_count,
  i.experience_count::bigint as experience_count,
  i.latest_published_at::timestamptz as latest_published_at,
  coalesce(c.sort_order, 0)::integer as sort_order
from inventory_with_slugs i
left join curated_choice c on c.city_key = i.city_key;

revoke all on public.destination_index from anon, authenticated;
grant select on public.destination_index to anon, authenticated;
