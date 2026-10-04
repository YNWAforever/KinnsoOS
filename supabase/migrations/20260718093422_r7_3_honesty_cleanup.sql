-- R7.3: remove only audited production fixture residue. Every update is
-- predicate-guarded so reapplying this migration is harmless.

update public.guides
set cover_url = null
where cover_url is not null
  and cover_url ~* '^https://picsum\.photos(?:/|$)';

update public.merchant_profiles
set website_url = null
where id = any(array[
  'c1219eec-8da0-d78d-7335-f2785d31187e'::uuid,
  '02425dc3-b5c6-4b10-c9cb-fab2118ad58b'::uuid,
  '04534d55-16f8-95ba-b50e-976fd12a630c'::uuid,
  '14e65377-ea50-7c58-fd26-bae99d221caa'::uuid
])
  and website_url is not null
  and (
    website_url !~* '^https://'
    or website_url ~* '^https://[^/]*(^|\.)example\.[^/]+'
  );

update public.articles as article
set published_at = null
from (values
  ('00000000-0000-0000-0000-000000000001'::uuid, 'pub-article'),
  ('00000000-0000-0000-0000-0000000000a1'::uuid, 'ramen-guide'),
  ('00000000-0000-0000-0000-0000000000a2'::uuid, 'sushi-guide'),
  ('00000000-0000-0000-0000-0000000000a3'::uuid, 'cafe-guide'),
  ('00000000-0000-0000-0000-0000000000a4'::uuid, 'mall-coupon'),
  ('00000000-0000-0000-0000-000000000003'::uuid, 'expired-article')
) as target(id, slug)
where article.id = target.id
  and article.slug = target.slug
  and article.published_at is not null;

update public.articles as article
set authors = array_remove(article.authors, 'jane-doe')
from (values
  ('00000000-0000-0000-0000-000000000001'::uuid, 'pub-article'),
  ('00000000-0000-0000-0000-0000000000a1'::uuid, 'ramen-guide'),
  ('00000000-0000-0000-0000-0000000000a2'::uuid, 'sushi-guide'),
  ('00000000-0000-0000-0000-0000000000a3'::uuid, 'cafe-guide'),
  ('00000000-0000-0000-0000-0000000000a4'::uuid, 'mall-coupon'),
  ('00000000-0000-0000-0000-000000000003'::uuid, 'expired-article')
) as target(id, slug)
where article.id = target.id
  and article.slug = target.slug
  and 'jane-doe' = any(article.authors);

delete from public.article_authors as author
where slug = 'jane-doe'
  and locale = 'en'
  and name = 'Jane Doe'
  and not exists (
    select 1
    from public.articles as article
    where 'jane-doe' = any(article.authors)
  );

update public.article_translations as translation
set content = content #- '{3,address,link}'
where translation.article_id = '00000000-0000-0000-0000-0000000000a1'::uuid
  and translation.locale = 'en'
  and translation.content #>> '{3,address,link}' = 'https://maps.example/x';
