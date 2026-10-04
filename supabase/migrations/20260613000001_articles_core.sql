-- SPINE (language-invariant) — from legacy `posts`
create table public.articles (
  id               uuid primary key default gen_random_uuid(),
  legacy_post_id   bigint unique not null,
  slug             text not null unique,
  url              text not null unique,
  category         text not null check (category in ('destination','dining','shopping')),
  thumbnails       text[] not null default '{}',
  authors          text[] not null default '{}',
  regions          text[] not null default '{}',
  tag_slugs        text[] not null default '{}',
  rating           numeric(3,2),
  views            bigint not null default 0,
  published_at     timestamptz,
  end_at           timestamptz,
  edit_at          timestamptz,
  source           text,
  source_synced_at timestamptz,
  source_hash      text,
  deleted_at       timestamptz,
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now()
);

-- PER-LOCALE — from legacy `post_translations`
create table public.article_translations (
  id               uuid primary key default gen_random_uuid(),
  article_id       uuid not null references public.articles(id) on delete cascade,
  locale           text not null,
  title            text,
  content          jsonb,
  summary          text,
  meta_title       text,
  meta_description text,
  meta_keywords    text,
  og_title         text,
  og_description   text,
  og_image         text,
  faq_title        text,
  labels           text[] not null default '{}',
  analyze_tags     text[] not null default '{}',
  validated_at     timestamptz,
  tsv tsvector generated always as
    (to_tsvector('simple', coalesce(title,'') || ' ' || coalesce(summary,''))) stored,
  unique (article_id, locale)
);
