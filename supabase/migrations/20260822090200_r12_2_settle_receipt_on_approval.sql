-- supabase/migrations/20260822090200_r12_2_settle_receipt_on_approval.sql
--
-- Widens create_mission_settlement_on_approval with a receipt_cashback branch. Every
-- existing line for paid/hybrid mission-fee settlement is unchanged, including its
-- participant-scoped ON CONFLICT arbiter -- receipt_cashback uses the NEW
-- submission-scoped index from 20260822090100 instead, since (unlike a one-time paid-mission
-- fee) each approved receipt must mint its own settlement.
--
-- The mission_type dispatch is restructured from the old "if not in ('paid','hybrid') then
-- return new" early-return guard into an if/elsif over the mission types that actually mint a
-- settlement. The old guard would have swallowed receipt_cashback silently (it is neither
-- 'paid' nor 'hybrid'), so it cannot simply be left in place with a branch appended after it.
-- 'coupon_affiliate' (and any future mission_type that mints nothing here) matches neither
-- branch and correctly falls through to `return new;` at the end, same as before.
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

  -- Travelpayouts missions earn through affiliate conversions (20260815100100), never a
  -- mission fee; minting both would pay twice for the same work.
  if v_source <> 'merchant' then return new; end if;

  -- missions.paid_fee_amount is nullable and, unlike the settlements column, carries NO
  -- >= 0 CHECK (mission_settlements_paid_fee_amount_check applies to mission_settlements
  -- only), so a non-positive value is possible at the database level and must be rejected
  -- here rather than written into a money row.
  if v_fee is null or v_fee <= 0 then return new; end if;

  if v_mission_type in ('paid', 'hybrid') then
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
  elsif v_mission_type = 'receipt_cashback' then
    insert into public.mission_settlements (
      mission_id,
      mission_participant_id,
      mission_milestone_submission_id,
      status,
      amount_currency,
      paid_fee_amount,
      creator_payout_status,
      source
    ) values (
      v_mission_id,
      new.mission_participant_id,
      new.id,
      'pending',
      upper(coalesce(v_currency, 'HKD')),
      v_fee,
      'pending',
      'receipt_cashback'
    )
    on conflict (mission_milestone_submission_id) where source = 'receipt_cashback'
    do nothing;
  end if;
  -- 'coupon_affiliate' (or any other mission_type) falls through here and mints nothing,
  -- same as the old guard's behavior.

  return new;
end $$;
