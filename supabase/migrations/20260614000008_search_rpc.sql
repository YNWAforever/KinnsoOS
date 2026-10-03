create or replace function public.search_articles(
  p_locale   text,
  p_category text default null,
  p_q        text default null,
  p_region   text default null,
  p_tag      text default null,
  p_limit    int  default 12,
  p_offset   int  default 0
)
returns table (
  url text, category text, thumbnails text[], rating numeric,
  published_at timestamptz, edit_at timestamptz,
  title text, summary text, total_count bigint
)
-- security invoker: respects the public-read RLS (only visible articles).
language sql stable security invoker set search_path = public as $$
  with base as (
    select a.url, a.category, a.thumbnails, a.rating, a.published_at, a.edit_at,
           t.title, t.summary, a.id
    from public.articles a
    join public.article_translations t on t.article_id = a.id and t.locale = p_locale
    where (p_category is null or a.category = p_category)
      and (p_region   is null or p_region = any(a.regions))
      and (p_tag      is null or p_tag = any(a.tag_slugs))
      and not (a.is_coupon and p_locale = 'en')   -- legacy: EN coupons off the index
      and (
        p_q is null or p_q = ''
        or t.tsv @@ websearch_to_tsquery('simple', p_q)
        or t.title ilike '%' || p_q || '%'
        or exists (
          select 1
          from public.article_tag_map m
          join public.article_tag_translations tt on tt.tag_id = m.tag_id and tt.locale = p_locale
          where m.article_id = a.id and tt.name ilike '%' || p_q || '%'
        )
      )
  )
  select url, category, thumbnails, rating, published_at, edit_at, title, summary,
         count(*) over () as total_count
  from base
  -- url is a stable, unique tiebreaker so LIMIT/OFFSET pagination is deterministic
  -- when two articles share a coalesce(edit_at, published_at) timestamp.
  order by coalesce(edit_at, published_at) desc, url asc
  limit p_limit offset p_offset;
$$;

grant execute on function public.search_articles(text, text, text, text, text, int, int)
  to anon, authenticated;

-- Supports the search ordering (avoids a heap sort as the corpus grows). coalesce
-- over two stable timestamp columns is immutable, so an expression index is valid.
create index if not exists articles_sort_idx
  on public.articles (coalesce(edit_at, published_at) desc);
