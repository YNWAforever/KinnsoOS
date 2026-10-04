-- Coupon/offer articles: legacy excluded EN coupon listings from the index.
-- Populated by the Plan 2 sync (offers CSV non-empty => coupon); defaults false.
alter table public.articles
  add column if not exists is_coupon boolean not null default false;
