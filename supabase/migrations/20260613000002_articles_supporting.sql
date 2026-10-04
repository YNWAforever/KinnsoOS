create table public.article_authors (
  id uuid primary key default gen_random_uuid(),
  slug text not null,
  locale text not null,
  name text not null,
  title text,
  bio text,
  avatar text,
  labels text[] not null default '{}',
  is_active boolean not null default true,
  unique (slug, locale)
);

create table public.article_faqs (
  id uuid primary key default gen_random_uuid(),
  article_id uuid not null references public.articles(id) on delete cascade,
  locale text not null,
  question text not null,
  answer text not null,
  weight int not null default 0,
  deleted_at timestamptz
);

create table public.article_tags (
  id uuid primary key default gen_random_uuid(),
  slug text not null unique,
  legacy_tag_id bigint unique
);

create table public.article_tag_translations (
  tag_id uuid not null references public.article_tags(id) on delete cascade,
  locale text not null,
  name text not null,
  primary key (tag_id, locale)
);

create table public.article_tag_map (
  article_id uuid not null references public.articles(id) on delete cascade,
  tag_id uuid not null references public.article_tags(id) on delete cascade,
  primary key (article_id, tag_id)
);

create table public.seo_redirects (
  id uuid primary key default gen_random_uuid(),
  from_path text not null unique,
  to_path text not null,
  status_code int not null default 301
);
