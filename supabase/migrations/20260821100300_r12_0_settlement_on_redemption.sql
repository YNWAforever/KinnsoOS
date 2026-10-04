-- supabase/migrations/20260821100300_r12_0_settlement_on_redemption.sql
--
-- Adds a `source` discriminator to mission_settlements (it had none -- R10.1's existing fee
-- settlements are distinguished only by which nullable columns are populated). Defaults to
-- 'mission_fee' so R10.1's own trigger needs zero changes; only this phase's new trigger sets
-- 'visit_redemption' explicitly.
alter table public.mission_settlements
  add column source text not null default 'mission_fee' check (source in ('mission_fee', 'visit_redemption'));

-- R10.1's mission_settlements_participant_fee_uniq predates the source column and enforces
-- "one non-affiliate settlement per participant, ever" -- correct for the one-time mission-fee
-- case it was designed for, but wrong for visit redemptions, where a participant can and
-- should earn many separate settlements over time. Narrow it to source = 'mission_fee' only,
-- leaving visit_redemption rows completely unconstrained by it. R10.1's own trigger
-- (20260815100200_r10_1_mint_settlement_on_approval.sql) always inserts with the new column's
-- default ('mission_fee'), so its behavior is completely unchanged by this.
drop index public.mission_settlements_participant_fee_uniq;
create unique index mission_settlements_participant_fee_uniq
  on public.mission_settlements (mission_participant_id)
  where affiliate_network_event_id is null and mission_participant_id is not null and source = 'mission_fee';

-- AFTER INSERT on offer_redemptions, not on offer_claims -- the settlement obligation is
-- created at the moment of redemption (the in-store event), not at claim time.
--
-- No-ops (does not raise) when the offer has no mission_id, or the claiming creator has no
-- mission_participants row: the discount still applies to the visitor, but there is no
-- mission context to hang a creator-payout obligation on. This differs from R10.1's own
-- trigger, which always has a mission context by construction (it fires from a milestone
-- submission that is itself scoped to a mission).
create or replace function public.create_settlement_on_offer_redemption() returns trigger
language plpgsql security definer set search_path = public as $$
declare
  v_mission_id uuid;
  v_creator_id uuid;
  v_commission_kind text;
  v_commission_value numeric;
  v_participant_id uuid;
  v_fee numeric;
  v_settlement_id uuid;
begin
  select mo.mission_id, mo.commission_kind, mo.commission_value, oc.creator_id
    into v_mission_id, v_commission_kind, v_commission_value, v_creator_id
    from public.offer_claims oc
    join public.merchant_offers mo on mo.id = oc.offer_id
    where oc.id = new.offer_claim_id;

  if v_mission_id is null then
    return new;
  end if;

  select id into v_participant_id
    from public.mission_participants
    where mission_id = v_mission_id and creator_id = v_creator_id;
  if v_participant_id is null then
    return new;
  end if;

  v_fee := case
    when v_commission_kind = 'flat' then v_commission_value
    else round(coalesce(new.amount_spent, 0) * v_commission_value / 100, 2)
  end;
  if v_fee <= 0 then
    return new;
  end if;

  insert into public.mission_settlements (mission_id, mission_participant_id, paid_fee_amount, amount_currency, status, source)
    values (v_mission_id, v_participant_id, v_fee, 'HKD', 'not_started', 'visit_redemption')
    returning id into v_settlement_id;

  update public.offer_redemptions set settlement_id = v_settlement_id where id = new.id;

  return new;
end;
$$;

create trigger create_settlement_on_offer_redemption_trg
  after insert on public.offer_redemptions
  for each row execute function public.create_settlement_on_offer_redemption();

-- Compensating update for create_mission_settlement_on_approval() (R10.1,
-- 20260815100200_r10_1_mint_settlement_on_approval.sql): the ON CONFLICT arbiter above must
-- exactly match mission_settlements_participant_fee_uniq's predicate, which this migration
-- just narrowed to `and source = 'mission_fee'`. Without this update, every mission-fee
-- approval would hard-error with "no unique or exclusion constraint matching the ON CONFLICT
-- specification" -- Postgres requires an exact predicate match to resolve the arbiter, and
-- an insert with no matching arbiter fails regardless of whether a real conflict exists.
-- Everything else in this function is byte-identical to the shipped R10.1 version.
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

