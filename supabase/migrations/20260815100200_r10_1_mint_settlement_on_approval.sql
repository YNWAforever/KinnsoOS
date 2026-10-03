-- R10.1: turn an approved paid-mission submission into a settlement row.
--
-- Mirror of create_booking_settlement_on_confirm() (20260704140000) for the merchant side.
-- Approval happens in reviewSubmissionAction (lib/missions/actions.ts:400-464), which
-- UPDATEs mission_milestone_submissions.status to 'approved' after a compare-and-swap.
-- Following that migration's own stated rule, this is a NEW trigger rather than an edit to
-- the already-shipped approval path.
--
-- SECURITY DEFINER is mandatory here, not stylistic: the approving actor is a MERCHANT
-- (reviewSubmissionAction requires a merchant_profiles row for auth.uid() and never checks
-- kinnso_ops_members), while mission_settlements INSERT is restricted by RLS to active ops
-- members. For the same reason this function must NOT call the ops-only audit-log helper
-- (public dot ops underscore audit underscore log underscore append, 20260628130000) —
-- that helper raises 'forbidden' (42501) for a non-ops actor (20260628130000:46-48) and
-- would abort the merchant's approval.
--
-- Timing decision, stated explicitly: the fee is minted on the FIRST approved submission
-- for a participant, and mission_settlements_participant_fee_uniq makes every later
-- approval a no-op — including a re-approval after a revision cycle, which is exactly the
-- flapping case (approved -> revision_requested -> approved) that would otherwise duplicate
-- the row. On a multi-milestone mission this records the full paid_fee_amount before all
-- milestones are delivered. That is safe because a settlement is an OBLIGATION, not a
-- payment: creator_payout_status is 'pending' and only an ops action can move it. If
-- per-milestone proration is wanted, R11.0 (review queue + SLA) is where it belongs.
--
-- mission_milestone_submissions carries mission_milestone_id and mission_participant_id but
-- NOT mission_id, so the join through mission_participants is required. The existing BEFORE
-- trigger app_private.enforce_mission_submission_integrity() already guarantees
-- participant.mission_id = milestone.mission_id, so this join is safe.

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

  -- 'coupon_affiliate' missions carry no fee by design.
  if v_mission_type not in ('paid','hybrid') then return new; end if;

  -- missions.paid_fee_amount is nullable and, unlike the settlements column, carries NO
  -- >= 0 CHECK (mission_settlements_paid_fee_amount_check applies to mission_settlements
  -- only), so a non-positive value is possible at the database level and must be rejected
  -- here rather than written into a money row.
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
    -- paid_fee_currency is nullable; 'HKD' matches what the studio missions list already
    -- displays for a fee with no currency (app/[locale]/studio/missions/page.tsx:77), so
    -- the settlement agrees with the number the creator was shown.
    upper(coalesce(v_currency, 'HKD')),
    v_fee,
    'pending'
  )
  -- creator_commission_amount is deliberately left NULL: R10.0's read model sums
  -- creator_commission_amount + paid_fee_amount, so writing both would double the fee.
  on conflict (mission_participant_id) where affiliate_network_event_id is null and mission_participant_id is not null
  do nothing;

  return new;
end $$;

revoke all on function public.create_mission_settlement_on_approval()
  from public, anon, authenticated, service_role;

drop trigger if exists mission_settlement_on_approval on public.mission_milestone_submissions;
create trigger mission_settlement_on_approval
  after insert or update on public.mission_milestone_submissions
  for each row execute function public.create_mission_settlement_on_approval();
