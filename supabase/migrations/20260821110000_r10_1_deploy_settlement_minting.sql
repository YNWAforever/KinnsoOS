-- R10.1's settlement-minting automation was written, tested, and merged to main back on
-- 2026-08-15 (20260815100000/100100/100200/100300) but was never actually applied to the
-- production database -- confirmed 2026-08-21 while deploying R12.0: neither
-- create_mission_settlement_on_approval() nor create_mission_settlement_on_affiliate_paid()
-- existed, no trigger on mission_milestone_submissions or affiliate_network_events called
-- anything like them, and mission_settlements had no unique index on either identity column
-- (only the old plain non-unique mission_settlements_affiliate_event_idx from pre-R10). Every
-- mission approval and every affiliate conversion has been creating zero settlement rows in
-- production since R10.1 shipped; the "mission_fee" rows visible in the admin payouts UI are
-- seed data, not organically minted. This migration deploys both triggers for the first time.
--
-- Verified before writing this: zero existing mission_settlements rows violate either
-- constraint below (checked via the same duplicate-detection query as R10.1's original
-- pre-check, reproduced here rather than skipped, since production data could differ from
-- what was true when this was checked), and there are zero eligible-but-unconverted paid
-- affiliate_network_events rows, so R10.1's original one-time backfill (20260815100300) is a
-- no-op today and is deliberately not included here -- it remains available verbatim if ever
-- needed later.
--
-- The mission-fee unique index differs from R10.1's original: R12.0 (2026-08-21, already
-- deployed) added a `source` column to mission_settlements and its own
-- create_settlement_on_offer_redemption() trigger, which legitimately inserts more than one
-- settlement per participant over time (repeat visit redemptions, source='visit_redemption').
-- R10.1's original unmodified index would incorrectly collide with those. Scoping this index
-- to source='mission_fee' -- and updating create_mission_settlement_on_approval()'s ON
-- CONFLICT clause to match -- keeps R10.1's "one mission-fee settlement per participant,
-- ever" guarantee intact while leaving R12.0's redemption settlements unconstrained by it,
-- exactly as R12.0's own migration (20260821100300) anticipated in its comments.
--
-- The affiliate side is untouched by R12.0 and is deployed byte-identical to the original.

do $$
declare v_dupes bigint;
begin
  select count(*) into v_dupes from (
    select affiliate_network_event_id
    from public.mission_settlements
    where affiliate_network_event_id is not null
    group by affiliate_network_event_id having count(*) > 1
  ) d;
  if v_dupes > 0 then
    raise exception
      'R10.1 deploy: % affiliate_network_event_id value(s) already have more than one mission_settlements row. Resolve them manually before applying this migration.',
      v_dupes;
  end if;

  select count(*) into v_dupes from (
    select mission_participant_id
    from public.mission_settlements
    where affiliate_network_event_id is null and mission_participant_id is not null
      and source = 'mission_fee'
    group by mission_participant_id having count(*) > 1
  ) d;
  if v_dupes > 0 then
    raise exception
      'R10.1 deploy: % mission_participant_id value(s) already have more than one mission_fee mission_settlements row. Resolve them manually before applying this migration.',
      v_dupes;
  end if;
end $$;

create unique index if not exists mission_settlements_affiliate_event_uniq
  on public.mission_settlements (affiliate_network_event_id)
  where affiliate_network_event_id is not null;

create unique index if not exists mission_settlements_participant_fee_uniq
  on public.mission_settlements (mission_participant_id)
  where affiliate_network_event_id is null and mission_participant_id is not null and source = 'mission_fee';

-- Affiliate-conversion minting -- verbatim from 20260815100100, no R12.0 interaction.

create or replace function public.create_mission_settlement_on_affiliate_paid()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  v_creator_rate numeric;
  v_kinnso_rate  numeric;
  v_gross        numeric;
begin
  if new.event_state <> 'paid' then return new; end if;

  if new.mission_id is null or new.mission_participant_id is null or new.creator_id is null then
    return new;
  end if;

  if tg_op = 'update' and old.event_state = 'paid' then return new; end if;

  v_gross := coalesce(new.profit_amount, 0);
  if v_gross <= 0 then return new; end if;

  select creator_commission_rate, kinnso_commission_rate
    into v_creator_rate, v_kinnso_rate
    from public.missions where id = new.mission_id;

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
    'pending',
    upper(coalesce(new.currency, 'USD')),
    v_gross,
    round(v_gross * v_creator_rate / 100.0, 2),
    case when v_kinnso_rate is null or v_kinnso_rate <= 0
         then null else round(v_gross * v_kinnso_rate / 100.0, 2) end,
    'pending',
    'pending',
    case when v_kinnso_rate is null or v_kinnso_rate <= 0 then null else 'pending' end
  )
  on conflict (affiliate_network_event_id) where affiliate_network_event_id is not null
  do nothing;

  return new;
end $$;

revoke all on function public.create_mission_settlement_on_affiliate_paid()
  from public, anon, authenticated, service_role;

drop trigger if exists mission_settlement_on_affiliate_paid on public.affiliate_network_events;
create trigger mission_settlement_on_affiliate_paid
  after insert or update on public.affiliate_network_events
  for each row execute function public.create_mission_settlement_on_affiliate_paid();

-- Mission-fee approval minting -- R10.1's original logic, ON CONFLICT clause updated to
-- match the source-scoped index above.

create or replace function public.create_mission_settlement_on_approval()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  v_mission_id   uuid;
  v_mission_type text;
  v_source       text;
  v_fee          numeric;
  v_currency     text;
begin
  if new.status <> 'approved' then return new; end if;
  if tg_op = 'update' and coalesce(old.status, '') = 'approved' then return new; end if;

  select mp.mission_id, m.mission_type, m.mission_source, m.paid_fee_amount, m.paid_fee_currency
    into v_mission_id, v_mission_type, v_source, v_fee, v_currency
    from public.mission_participants mp
    join public.missions m on m.id = mp.mission_id
    where mp.id = new.mission_participant_id;

  if v_mission_id is null then return new; end if;

  if v_source <> 'merchant' then return new; end if;

  if v_mission_type not in ('paid','hybrid') then return new; end if;

  if v_fee is null or v_fee <= 0 then return new; end if;

  insert into public.mission_settlements (
    mission_id,
    mission_participant_id,
    status,
    amount_currency,
    paid_fee_amount,
    creator_payout_status
  ) values (
    v_mission_id,
    new.mission_participant_id,
    'pending',
    upper(coalesce(v_currency, 'HKD')),
    v_fee,
    'pending'
  )
  on conflict (mission_participant_id) where affiliate_network_event_id is null and mission_participant_id is not null and source = 'mission_fee'
  do nothing;

  return new;
end $$;

revoke all on function public.create_mission_settlement_on_approval()
  from public, anon, authenticated, service_role;

drop trigger if exists mission_settlement_on_approval on public.mission_milestone_submissions;
create trigger mission_settlement_on_approval
  after insert or update on public.mission_milestone_submissions
  for each row execute function public.create_mission_settlement_on_approval();
