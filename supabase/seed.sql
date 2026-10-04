insert into public.articles (id, legacy_post_id, slug, url, category, published_at, end_at)
values
  ('00000000-0000-0000-0000-000000000001', 1, 'pub-article',    'pub-article',    'dining',      null, null),
  ('00000000-0000-0000-0000-000000000002', 2, 'draft-article',  'draft-article',  'shopping',    null,                       null),
  ('00000000-0000-0000-0000-000000000003', 3, 'expired-article','expired-article','destination', null, now() - interval '1 day');

insert into public.article_translations (article_id, locale, title, summary) values
  ('00000000-0000-0000-0000-000000000001', 'en',    'Published EN', 'A published article.'),
  ('00000000-0000-0000-0000-000000000001', 'zh-hk', '已發佈',        '一篇已發佈文章。');

-- ── Plan 3 render/SEO fixtures ───────────────────────────────────────────────
-- A rich published dining article (en + zh-hk), in destinations? no: dining.
insert into public.articles
  (id, legacy_post_id, slug, url, category, thumbnails, regions, tag_slugs, rating, views, published_at, edit_at)
values
  ('00000000-0000-0000-0000-0000000000a1', 101, 'ramen-guide', 'ramen-guide', 'dining',
   '{https://cdn.kinnso.ai/a1.jpg}', '{tokyo}', '{noodles}', 4.50, 1000,
   now() - interval '5 day', now() - interval '2 day'),
-- two more same-category (dining) published articles for "you may like"
  ('00000000-0000-0000-0000-0000000000a2', 102, 'sushi-guide', 'sushi-guide', 'dining',
   '{https://cdn.kinnso.ai/a2.jpg}', '{tokyo}', '{sushi}', 4.20, 500,
   null, now() - interval '1 day'),
  ('00000000-0000-0000-0000-0000000000a3', 103, 'cafe-guide', 'cafe-guide', 'dining',
   '{https://cdn.kinnso.ai/a3.jpg}', '{osaka}', '{coffee}', 4.00, 200,
   null, null),
-- an EN coupon article (is_coupon) with en + zh-hk translations
  ('00000000-0000-0000-0000-0000000000a4', 104, 'mall-coupon', 'mall-coupon', 'shopping',
   '{https://cdn.kinnso.ai/a4.jpg}', '{hongkong}', '{coupon}', null, 50,
   null, null);

update public.articles set is_coupon = true where url = 'mall-coupon';

insert into public.article_translations
  (article_id, locale, title, summary, content, meta_title, meta_description, og_image, faq_title)
values
  ('00000000-0000-0000-0000-0000000000a1', 'en', 'Best Ramen in Tokyo',
   'A guide to the best ramen shops in Tokyo.',
   jsonb_build_array(
     jsonb_build_object('type', 'text', 'id', 'block-0', 'title', 'Welcome', 'content',
       '<p>Welcome to Tokyo ramen. ' || repeat('Tokyo ramen shops welcome curious travellers with regional broths fresh noodles careful toppings friendly service and practical neighbourhood advice. ', 4) || '</p>'),
     jsonb_build_object('type', 'text', 'id', 'block-1', 'title', 'Choosing a bowl', 'content',
       '<p>' || repeat('Tokyo ramen shops welcome curious travellers with regional broths fresh noodles careful toppings friendly service and practical neighbourhood advice. ', 4) || '</p>'),
     jsonb_build_object('type', 'text', 'id', 'block-2', 'title', 'Planning your visit', 'content',
       '<p>' || repeat('Tokyo ramen shops welcome curious travellers with regional broths fresh noodles careful toppings friendly service and practical neighbourhood advice. ', 4) || '</p>')
   ),
   'Best Ramen in Tokyo', 'The definitive Tokyo ramen guide.', 'https://cdn.kinnso.ai/og-a1.jpg', 'Ramen FAQ'),
  ('00000000-0000-0000-0000-0000000000a1', 'zh-hk', '東京最佳拉麵',
   '東京最佳拉麵店指南。',
   jsonb_build_array(
     jsonb_build_object('type', 'text', 'id', 'block-0', 'title', '歡迎', 'content',
       '<p>歡迎來到東京拉麵。 ' || repeat('東京 拉麵 店 歡迎 旅客 品嚐 地道 湯底 新鮮 麵條 用心 配料 親切 服務 實用 社區 指南 。 ', 4) || '</p>'),
     jsonb_build_object('type', 'text', 'id', 'block-1', 'title', '選擇拉麵', 'content',
       '<p>' || repeat('東京 拉麵 店 歡迎 旅客 品嚐 地道 湯底 新鮮 麵條 用心 配料 親切 服務 實用 社區 指南 。 ', 4) || '</p>'),
     jsonb_build_object('type', 'text', 'id', 'block-2', 'title', '行程建議', 'content',
       '<p>' || repeat('東京 拉麵 店 歡迎 旅客 品嚐 地道 湯底 新鮮 麵條 用心 配料 親切 服務 實用 社區 指南 。 ', 4) || '</p>')
   ),
   '東京最佳拉麵', '東京拉麵終極指南。', 'https://cdn.kinnso.ai/og-a1-hk.jpg', '拉麵常見問題'),
  ('00000000-0000-0000-0000-0000000000a2', 'en', 'Best Sushi in Tokyo', 'A sushi guide.',
   '[{"type":"text","id":"block-0","content":"<p>Sushi.</p>"}]'::jsonb, null, null, null, null),
  ('00000000-0000-0000-0000-0000000000a3', 'en', 'Best Cafes in Osaka', 'A cafe guide.',
   '[{"type":"text","id":"block-0","content":"<p>Cafe.</p>"}]'::jsonb, null, null, null, null),
  -- coupon: meta_description deliberately empty -> falls back to summary
  ('00000000-0000-0000-0000-0000000000a4', 'en', 'Mall Coupon', 'Save at the mall.',
   '[{"type":"offer-box","id":"block-0","title":"Deal","content":"<p>10% off.</p>"}]'::jsonb, null, '', null, null),
  ('00000000-0000-0000-0000-0000000000a4', 'zh-hk', '商場優惠', '商場慳錢。',
   '[{"type":"offer-box","id":"block-0","title":"優惠","content":"<p>九折。</p>"}]'::jsonb, null, '', null, null);

insert into public.article_faqs (article_id, locale, question, answer, weight) values
  ('00000000-0000-0000-0000-0000000000a1', 'en', 'Is ramen cheap?', 'Yes, around ¥1000.', 10),
  ('00000000-0000-0000-0000-0000000000a1', 'en', 'When to go?', 'Lunch is best.', 5);

insert into public.article_authors (slug, locale, name, title, bio, avatar, labels, is_active)
select 'kinnso-editorial', locale, 'KINNSO Editorial', null, null, null, '{}', true
from unnest(array['en','zh-hk','zh-tw','zh-cn','ja','ko','th']) as locale
on conflict (slug, locale) do update
set name = excluded.name, is_active = true;

update public.articles
set authors = '{kinnso-editorial}'
where id = '00000000-0000-0000-0000-0000000000a1' and slug = 'ramen-guide' and url = 'ramen-guide';

insert into public.article_tags (id, slug, legacy_tag_id) values
  ('00000000-0000-0000-0000-0000000000b1', 'noodles', 9001);
insert into public.article_tag_translations (tag_id, locale, name) values
  ('00000000-0000-0000-0000-0000000000b1', 'en', 'Noodles');
insert into public.article_tag_map (article_id, tag_id) values
  ('00000000-0000-0000-0000-0000000000a1', '00000000-0000-0000-0000-0000000000b1');

insert into public.seo_redirects (from_path, to_path) values
  ('/post/old-ramen', '/articles/dining/ramen-guide');

-- Phase R7.1 deterministic local funnel fixtures (never used by hosted environments).
insert into auth.users (
  instance_id, id, aud, role, email, encrypted_password, email_confirmed_at,
  raw_app_meta_data, raw_user_meta_data, is_super_admin, created_at, updated_at
)
values
  ('00000000-0000-0000-0000-000000000000', '00000000-0000-0000-0000-000000000701', 'authenticated', 'authenticated', 'r7-smoke-creator@example.test', '', now(), '{"provider":"email","providers":["email"]}'::jsonb, '{}'::jsonb, false, now(), now()),
  ('00000000-0000-0000-0000-000000000000', '00000000-0000-0000-0000-000000000702', 'authenticated', 'authenticated', 'r7-smoke-merchant@example.test', '', now(), '{"provider":"email","providers":["email"]}'::jsonb, '{}'::jsonb, false, now(), now())
on conflict (id) do nothing;

update public.creators
set display_name = 'R7 Smoke Creator',
    handle = 'r7-smoke-creator',
    bio = 'Local smoke-funnel creator fixture.',
    public_profile = '{"niches":["travel"],"languages":["en"]}'::jsonb,
    status = 'active',
    updated_at = now()
where id = '00000000-0000-0000-0000-000000000701';

insert into public.merchant_profiles
  (id, user_id, company_name, contact_name, contact_email, slug, tagline, city, status)
values
  ('00000000-0000-0000-0000-000000000705', '00000000-0000-0000-0000-000000000702', 'R7 Smoke Tokyo Host', 'R7 Smoke Merchant', 'r7-smoke-merchant@example.test', 'r7-smoke-tokyo-host', 'Local smoke-funnel host', 'Tokyo', 'active')
on conflict (id) do update set
  user_id = excluded.user_id, company_name = excluded.company_name, contact_name = excluded.contact_name,
  contact_email = excluded.contact_email, slug = excluded.slug, tagline = excluded.tagline, city = excluded.city, status = excluded.status;

insert into public.guides
  (id, creator_id, creator_handle, creator_name, slug, title, summary, cover_url, city, status, saves_count, published_at)
values
  ('00000000-0000-0000-0000-000000000703', '00000000-0000-0000-0000-000000000701', 'r7-smoke-creator', 'R7 Smoke Creator', 'r7-smoke-tokyo-guide', 'R7 Smoke Tokyo Guide', 'A deterministic local guide for the R7 funnel smoke journey.', null, 'Tokyo', 'published', 0, now())
on conflict (id) do update set
  creator_id = excluded.creator_id, creator_handle = excluded.creator_handle, creator_name = excluded.creator_name,
  slug = excluded.slug, title = excluded.title, summary = excluded.summary, cover_url = excluded.cover_url, city = excluded.city,
  status = excluded.status, saves_count = excluded.saves_count, published_at = excluded.published_at;

insert into public.guides
  (id, creator_id, creator_handle, creator_name, slug, title, summary, cover_url, city, status, saves_count, published_at)
select
  ('00000000-0000-0000-0000-' || lpad((800 + n)::text, 12, '0'))::uuid,
  '00000000-0000-0000-0000-000000000701'::uuid,
  'r7-smoke-creator',
  'R7 Smoke Creator',
  'r7-explore-tokyo-' || lpad(n::text, 2, '0'),
  'R7 Explore Tokyo Guide ' || lpad(n::text, 2, '0'),
  'Deterministic Explore pagination guide ' || n || '.',
  null,
  'Tokyo',
  'published',
  n,
  now() - make_interval(days => n)
from generate_series(1, 12) as series(n)
on conflict (id) do update set
  creator_id = excluded.creator_id,
  creator_handle = excluded.creator_handle,
  creator_name = excluded.creator_name,
  slug = excluded.slug,
  title = excluded.title,
  summary = excluded.summary,
  cover_url = excluded.cover_url,
  city = excluded.city,
  status = excluded.status,
  saves_count = excluded.saves_count,
  published_at = excluded.published_at;

insert into public.experiences
  (id, merchant_profile_id, slug, title, summary, description, city, price_amount, currency, duration_minutes, cover_url, status, published_at)
values
  ('00000000-0000-0000-0000-000000000704', '00000000-0000-0000-0000-000000000705', 'r7-smoke-tokyo-experience', 'R7 Smoke Tokyo Experience', 'A deterministic local experience for the R7 funnel smoke journey.', 'Explore Tokyo with the R7 smoke-funnel host.', 'Tokyo', 12000, 'JPY', 120, null, 'published', now())
on conflict (id) do update set
  merchant_profile_id = excluded.merchant_profile_id, slug = excluded.slug, title = excluded.title, summary = excluded.summary, description = excluded.description,
  city = excluded.city, price_amount = excluded.price_amount, currency = excluded.currency, duration_minutes = excluded.duration_minutes,
  cover_url = excluded.cover_url, status = excluded.status, published_at = excluded.published_at;

insert into public.experience_availability
  (id, experience_id, date, capacity, booked_count, status)
values
  ('00000000-0000-0000-0000-000000000706', '00000000-0000-0000-0000-000000000704', current_date + 30, 8, 0, 'open')
on conflict (id) do update set
  experience_id = excluded.experience_id, date = excluded.date, capacity = excluded.capacity, booked_count = excluded.booked_count, status = excluded.status;
