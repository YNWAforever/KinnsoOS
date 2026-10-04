-- supabase/migrations/20260821100000_r12_0_offer_claim_redemption_tables.sql
--
-- R12.0 -- The Visit Loop MVP. See
-- docs/superpowers/specs/2026-08-21-phase-r12-0-visit-loop-design.md.
--
-- merchant_offers: the redeemable thing a mission promotes. Merchant self-service (RLS
-- owner-write, not RPC-gated -- creating/pausing/ending an offer has no race-safety or fraud
-- concern the way claiming and redeeming do).
--
-- offer_claims: the attribution moment. Requires sign-in (visitor_user_id not null, no
-- anonymous/email variant -- see design doc Decision 4). RPC-only writes.
--
-- offer_redemptions: the in-store moment of truth. RPC-only writes.

create table public.merchant_offers (
  id uuid primary key default gen_random_uuid(),
  merchant_profile_id uuid not null references public.merchant_profiles(id) on delete cascade,
  mission_id uuid references public.missions(id) on delete set null,
  title text not null check (char_length(btrim(title)) between 1 and 120),
  terms text not null check (char_length(btrim(terms)) between 1 and 1000),
  discount_kind text not null check (discount_kind in ('percent', 'amount', 'item')),
  discount_value numeric(10,2) not null check (discount_value > 0 and discount_value <> 'NaN'::numeric),
  commission_kind text not null check (commission_kind in ('flat', 'percent')),
  commission_value numeric(10,2) not null check (commission_value > 0 and commission_value <> 'NaN'::numeric),
  valid_from timestamptz not null,
  valid_to timestamptz not null check (valid_to > valid_from),
  per_visitor_limit integer not null default 1 check (per_visitor_limit > 0),
  total_cap integer check (total_cap > 0),
  claimed_count integer not null default 0 check (claimed_count >= 0),
  redeemed_count integer not null default 0 check (redeemed_count >= 0),
  status text not null default 'draft' check (status in ('draft', 'live', 'paused', 'ended')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint merchant_offers_discount_percent_bounded check (discount_kind <> 'percent' or discount_value <= 100),
  constraint merchant_offers_commission_percent_bounded check (commission_kind <> 'percent' or commission_value <= 100)
);

create index merchant_offers_merchant_idx on public.merchant_offers (merchant_profile_id, created_at desc);
create index merchant_offers_mission_idx on public.merchant_offers (mission_id) where mission_id is not null;
create index merchant_offers_live_idx on public.merchant_offers (status, valid_from, valid_to) where status = 'live';

alter table public.merchant_offers enable row level security;
revoke all on public.merchant_offers from public, anon, authenticated;

create policy merchant_offers_owner_all on public.merchant_offers
  for all
  to authenticated
  using (
    exists (
      select 1 from public.merchant_profiles mp
      where mp.id = merchant_offers.merchant_profile_id
        and mp.user_id = (select auth.uid())
    )
    or exists (
      select 1 from public.kinnso_ops_members ops
      where ops.user_id = (select auth.uid())
        and ops.status = 'active'
    )
  )
  with check (
    exists (
      select 1 from public.merchant_profiles mp
      where mp.id = merchant_offers.merchant_profile_id
        and mp.user_id = (select auth.uid())
    )
    or exists (
      select 1 from public.kinnso_ops_members ops
      where ops.user_id = (select auth.uid())
        and ops.status = 'active'
    )
  );

grant select, insert, delete on public.merchant_offers to authenticated;
grant update (title, terms, discount_kind, discount_value, commission_kind, commission_value, valid_from, valid_to, per_visitor_limit, total_cap, status, updated_at) on public.merchant_offers to authenticated;

create trigger merchant_offers_set_updated_at
  before update on public.merchant_offers
  for each row execute procedure public.set_updated_at();

create table public.offer_claims (
  id uuid primary key default gen_random_uuid(),
  offer_id uuid not null references public.merchant_offers(id) on delete cascade,
  creator_id uuid not null references public.creators(id),
  guide_id uuid references public.guides(id),
  visitor_user_id  uuid not null references auth.users(id),
  claim_token_hash text not null unique,
  source_surface text not null check (source_surface in ('guide', 'profile')),
  expires_at timestamptz not null,
  status text not null default 'active' check (status in ('active', 'redeemed', 'expired')),
  created_at timestamptz not null default now()
);

create index offer_claims_visitor_idx on public.offer_claims (visitor_user_id, created_at desc);
create index offer_claims_offer_idx on public.offer_claims (offer_id, created_at desc);

alter table public.offer_claims enable row level security;
revoke all on public.offer_claims from public, anon, authenticated;

create policy offer_claims_visitor_select on public.offer_claims
  for select
  to authenticated
  using (visitor_user_id = (select auth.uid()));

create policy offer_claims_merchant_select on public.offer_claims
  for select
  to authenticated
  using (
    exists (
      select 1
      from public.merchant_offers mo
      join public.merchant_profiles mp on mp.id = mo.merchant_profile_id
      where mo.id = offer_claims.offer_id
        and mp.user_id = (select auth.uid())
    )
    or exists (
      select 1 from public.kinnso_ops_members ops
      where ops.user_id = (select auth.uid())
        and ops.status = 'active'
    )
  );

grant select on public.offer_claims to authenticated; -- inserts/updates happen only via claim_offer/redeem_offer_claim

create table public.offer_redemptions (
  id                            uuid primary key default gen_random_uuid(),
  offer_claim_id                uuid not null unique references public.offer_claims(id),
  merchant_profile_id           uuid not null references public.merchant_profiles(id),
  redeemed_by_merchant_user_id  uuid not null references auth.users(id),
  redeemed_at                   timestamptz not null default now(),
  amount_spent                  numeric check (amount_spent >= 0),
  settlement_id                 uuid references public.mission_settlements(id),
  created_at                    timestamptz not null default now()
);

create index offer_redemptions_merchant_idx on public.offer_redemptions (merchant_profile_id, redeemed_at desc);

alter table public.offer_redemptions enable row level security;
revoke all on public.offer_redemptions from public, anon, authenticated;

create policy offer_redemptions_visitor_select on public.offer_redemptions
  for select
  to authenticated
  using (
    exists (
      select 1 from public.offer_claims oc
      where oc.id = offer_redemptions.offer_claim_id
        and oc.visitor_user_id = (select auth.uid())
    )
  );

create policy offer_redemptions_merchant_select on public.offer_redemptions
  for select
  to authenticated
  using (
    exists (
      select 1 from public.merchant_profiles mp
      where mp.id = offer_redemptions.merchant_profile_id
        and mp.user_id = (select auth.uid())
    )
    or exists (
      select 1 from public.kinnso_ops_members ops
      where ops.user_id = (select auth.uid())
        and ops.status = 'active'
    )
  );

grant select on public.offer_redemptions to authenticated; -- inserts happen only via redeem_offer_claim
