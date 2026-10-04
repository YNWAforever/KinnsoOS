-- security definer so anon can bump the counter, but the WHERE clause mirrors
-- the public-read RLS rules so views are only counted for visible articles
-- (never for draft / expired / soft-deleted rows).
create or replace function public.increment_article_view(p_url text)
returns void language sql security definer set search_path = public as $$
  update public.articles set views = views + 1
  where url = p_url
    and published_at is not null and published_at <= now()
    and (end_at is null or end_at >= now())
    and deleted_at is null;
$$;

create or replace function public.get_you_may_like(p_article_id uuid, p_locale text, p_limit int default 5)
returns table (url text, title text, category text, thumbnails text[], published_at timestamptz)
-- security invoker: reads only RLS-visible rows; avoids the anon SECURITY DEFINER advisor warning
language sql stable security invoker set search_path = public as $$
  select a.url, t.title, a.category, a.thumbnails, a.published_at
  from public.articles a
  left join public.article_translations t on t.article_id = a.id and t.locale = p_locale
  where a.category = (select category from public.articles where id = p_article_id)
    and a.id <> p_article_id
    and a.published_at is not null and a.published_at <= now()
    and (a.end_at is null or a.end_at >= now()) and a.deleted_at is null
  order by coalesce(a.edit_at, a.published_at) desc
  limit p_limit;
$$;

grant execute on function public.increment_article_view(text) to anon, authenticated;
grant execute on function public.get_you_may_like(uuid, text, int) to anon, authenticated;
