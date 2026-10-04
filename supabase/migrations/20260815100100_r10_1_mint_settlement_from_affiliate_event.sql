-- R10.1: turn a paid affiliate conversion into a settlement row.
--
-- The Travelpayouts cron (app/api/cron/travelpayouts-sync/route.ts, daily at 03:00 UTC)
-- upserts attributed conversions into affiliate_network_events on
-- (network, external_action_id), WITHOUT ignoreDuplicates — so it compiles to
-- ON CONFLICT DO UPDATE and a conversion moving processing -> paid inside its 7-day
-- overlap window arrives as a real UPDATE. This is a trigger rather than a change to that
-- route so the transition is caught wherever it happens: the nightly cron, the one-time
-- backfill in 20260815100300, or any later ops correction. It also mirrors
-- create_booking_settlement_on_confirm() (20260704140000), which is the established shape
-- for auto-created settlements in this schema.
--
-- SECURITY DEFINER because mission_settlements INSERT is restricted by RLS to active
-- kinnso_ops_members (mission_settlements_ops_insert, 20260617173938:608), and no minting
-- actor is ever an ops member: the cron runs as service_role and the backfill runs as the
-- migration owner.
--
-- Error policy, chosen deliberately and differing from contribution_on_submission()
-- (20260625090000), which swallows everything into a warning: the guards below all return
-- early for legitimate data states (unattributed conversion, mission with no configured
-- rate, zero-value action), so anything still able to raise is a real invariant violation.
-- A settlement that silently fails to mint is money the creator never sees and nobody is
-- told about. Points can be recomputed; an unrecorded payment obligation cannot.
--
-- Rates on public.missions are PERCENTAGES, not fractions: the seeded Travelpayouts offers
-- carry creator_commission_rate = 70 and kinnso_commission_rate = 30
-- (20260622153645_seed_travelpayouts_offers.sql:63). Hence the /100.0.

create or replace function public.create_mission_settlement_on_affiliate_paid()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  v_creator_rate numeric;
  v_kinnso_rate  numeric;
  v_gross        numeric;
begin
  -- Only a paid conversion creates an obligation. 'processing' may still be reversed,
  -- and 'cancelled'/'unknown' never become money.
  if new.event_state <> 'paid' then return new; end if;

  -- An unattributed conversion is real revenue for Kinnso but belongs to no creator.
  -- affiliate_partner_links rows whose sub_id still carries the 'pending:' prefix written
  -- by app_private.prepare_affiliate_partner_link_insert() never match an incoming sub_id,
  -- so this branch is reached in normal operation and is not an error.
  if new.mission_id is null or new.mission_participant_id is null or new.creator_id is null then
    return new;
  end if;

  -- Already handled on the transition into 'paid'; the unique index below is the real
  -- guarantee, this just avoids the wasted work on every subsequent nightly re-upsert.
  if tg_op = 'update' and old.event_state = 'paid' then return new; end if;

  v_gross := coalesce(new.profit_amount, 0);
  if v_gross <= 0 then return new; end if;

  select creator_commission_rate, kinnso_commission_rate
    into v_creator_rate, v_kinnso_rate
    from public.missions where id = new.mission_id;

  -- No configured rate means no defensible amount. Minting a zero or an invented default
  -- would put a number in front of a creator that the product never promised.
  if v_creator_rate is null or v_creator_rate <= 0 then return new; end if;

  insert into public.mission_settlements (
    mission_id,
    mission_participant_id,
    affiliate_network_event_id,
    status,
    amount_currency,
    affiliate_commission_amount,
    creator_commission_amount,
    kinnso_commission_amount,
    affiliate_commission_status,
    creator_payout_status,
    kinnso_commission_status
  ) values (
    new.mission_id,
    new.mission_participant_id,
    new.id,
    -- 'pending' rather than the column default 'not_started': the money is owed the moment
    -- the network reports it paid. Nothing here marks anything paid — that is R10.2.
    'pending',
    -- affiliate_network_events stores lowercase currency codes ('usd'); mission_settlements
    -- uses amount_currency, NOT currency, and R10.0's read model uppercases on the way out.
    upper(coalesce(new.currency, 'USD')),
    v_gross,
    round(v_gross * v_creator_rate / 100.0, 2),
    case when v_kinnso_rate is null or v_kinnso_rate <= 0
         then null else round(v_gross * v_kinnso_rate / 100.0, 2) end,
    'pending',
    'pending',
    case when v_kinnso_rate is null or v_kinnso_rate <= 0 then null else 'pending' end
  )
  -- The predicate is repeated verbatim: Postgres cannot infer a partial unique index
  -- (mission_settlements_affiliate_event_uniq, 20260815100000) without it.
  on conflict (affiliate_network_event_id) where affiliate_network_event_id is not null
  do nothing;

  return new;
end $$;

-- Trigger functions need no EXECUTE grant, and Supabase's default privileges hand one to
-- anon/authenticated/service_role on every new public function (see 20260627155000), so
-- every role is revoked by name.
revoke all on function public.create_mission_settlement_on_affiliate_paid()
  from public, anon, authenticated, service_role;

drop trigger if exists mission_settlement_on_affiliate_paid on public.affiliate_network_events;
create trigger mission_settlement_on_affiliate_paid
  after insert or update on public.affiliate_network_events
  for each row execute function public.create_mission_settlement_on_affiliate_paid();
