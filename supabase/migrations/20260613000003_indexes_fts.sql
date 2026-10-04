create index articles_category_idx     on public.articles (category);
create index articles_published_idx    on public.articles (published_at desc);
create index articles_regions_gin      on public.articles using gin (regions);
create index articles_tag_slugs_gin    on public.articles using gin (tag_slugs);
create index article_translations_tsv_gin on public.article_translations using gin (tsv);
create index article_translations_locale_idx on public.article_translations (locale);
create index article_faqs_lookup_idx   on public.article_faqs (article_id, locale, weight);
