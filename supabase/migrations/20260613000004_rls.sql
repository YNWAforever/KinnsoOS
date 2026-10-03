alter table public.articles                 enable row level security;
alter table public.article_translations     enable row level security;
alter table public.article_authors          enable row level security;
alter table public.article_faqs             enable row level security;
alter table public.article_tags             enable row level security;
alter table public.article_tag_translations enable row level security;
alter table public.article_tag_map          enable row level security;
alter table public.seo_redirects            enable row level security;

create policy "articles_public_read" on public.articles
  for select using (
    published_at is not null and published_at <= now()
    and (end_at is null or end_at >= now())
    and deleted_at is null
  );

create policy "translations_public_read" on public.article_translations
  for select using (exists (
    select 1 from public.articles a where a.id = article_id
      and a.published_at is not null and a.published_at <= now()
      and (a.end_at is null or a.end_at >= now()) and a.deleted_at is null));

create policy "faqs_public_read" on public.article_faqs
  for select using (deleted_at is null and exists (
    select 1 from public.articles a where a.id = article_id
      and a.published_at is not null and a.published_at <= now()
      and (a.end_at is null or a.end_at >= now()) and a.deleted_at is null));

create policy "authors_public_read"  on public.article_authors          for select using (is_active);
create policy "tags_public_read"     on public.article_tags             for select using (true);
create policy "tagtrans_public_read" on public.article_tag_translations for select using (true);
create policy "tagmap_public_read"   on public.article_tag_map          for select using (true);
create policy "redirects_public_read" on public.seo_redirects           for select using (true);
