-- Weighted relevance for the ranked catalogue search.
--
-- The first ranking counted a token once if it appeared anywhere, so a title
-- match and a summary match scored the same and ties fell back to publication
-- date ("family trip singapore" still put Bali first). Weight fields instead:
-- title 15, city 8, summary 5, creator 3 per matched token, keeping the verified
-- and saves boosts, then recency.
create or replace function public.search_kinnso_catalog(
  p_query text default '',
  p_city text default '',
  p_limit integer default 13,
  p_offset integer default 0
)
returns jsonb
language plpgsql stable security definer set search_path = ''
as $$
declare
  q text := btrim(coalesce(p_query, ''));
  c text := btrim(coalesce(p_city, ''));
  lim integer := least(greatest(coalesce(p_limit, 13), 1), 25);
  off integer := greatest(coalesce(p_offset, 0), 0);
  tokens text[];
begin
  select coalesce(array_agg(left(token, 40) order by token), '{}')
    into tokens
    from (
      select distinct regexp_replace(lower(t), '[%_\\]', '', 'g') as token
        from regexp_split_to_table(q, '[^[:alnum:]]+') as t
       where char_length(t) >= 2
         and t not in (
           'the','and','for','with','which','what','who','that','this','guide','guides','covers','cover',
           'about','good','best','near','from','have','can','you','your','find','show','are','was','were',
           'will','would','should','could','does','did','but','not','any','all','out','our','their','there',
           'here','trip','travel','traveller','traveler','help','need','want','looking','look','tell','give',
           'some','why','how','when','where','it','its','be','been','if','of','on','at','by','or','as','to',
           'in','is','an','a'
         )
       limit 5
    ) words;

  return coalesce((
    select jsonb_agg(item order by score desc, published_at desc nulls last, id)
    from (
      select g.score, g.published_at, g.id,
             jsonb_build_object(
               'id', g.id, 'slug', g.slug, 'title', g.title, 'city', g.city,
               'summary', left(g.summary, 2000), 'cover_url', g.cover_url,
               'creator_handle', g.creator_handle, 'creator_name', g.creator_name,
               'published_at', g.published_at) as item
      from (
        select base.*, (
          coalesce((select sum(
              (case when base.title ilike '%' || token || '%' then 15 else 0 end) +
              (case when base.city ilike '%' || token || '%' then 8 else 0 end) +
              (case when base.summary ilike '%' || token || '%' then 5 else 0 end) +
              (case when base.creator_name ilike '%' || token || '%' then 3 else 0 end)
            ) from unnest(tokens) token), 0)
          + case when base.status = 'published' and not base.synthetic
                  and exists (select 1 from kinnso_internal.guide_version_attestations a where a.guide_id = base.id)
                  and jsonb_array_length(base.source_refs) > 0
                  and base.place_verified_at is not null then 5 else 0 end
          + least((select count(*) from public.guide_saves s where s.guide_id = base.id), 20) * 0.5
        ) as score
        from public.guides base
        where base.status = 'published'
          and (c = '' or lower(base.city) = lower(c))
          and (cardinality(tokens) = 0 or exists (
            select 1 from unnest(tokens) token
             where base.title ilike '%' || token || '%'
                or base.summary ilike '%' || token || '%'
                or base.city ilike '%' || token || '%'
                or base.creator_name ilike '%' || token || '%'))
      ) g
      order by g.score desc, g.published_at desc nulls last, g.id
      limit lim offset off
    ) rows
  ), '[]'::jsonb);
end $$;

revoke all on function public.search_kinnso_catalog(text, text, integer, integer) from public;
grant execute on function public.search_kinnso_catalog(text, text, integer, integer) to anon, authenticated;
