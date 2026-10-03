-- supabase/migrations/20260822090400_r12_2_submit_receipt.sql
--
-- Creator-facing entry point for a repeatable receipt-cashback submission. Locks the
-- missions row (the one that carries max_receipts_per_creator) to serialize concurrent
-- submissions from the same creator, counts their own 'submitted'/
-- 'approved' rows against missions.max_receipts_per_creator (a rejected receipt frees up a
-- slot -- only active rows count), then inserts. Mirrors claim_offer's lock-count-insert
-- shape (R12.0/R12.1): claim_offer takes `for update` on merchant_offers (the shared-cap
-- anchor row) for every claim regardless of visitor; here the missions row is the analogous
-- anchor -- it's what the cap (max_receipts_per_creator) lives on, and locking it for every
-- submission (not just a per-participant row) serializes concurrent calls from the SAME
-- creator just as reliably, at the cost of the same cross-creator contention claim_offer
-- already accepts.
--
-- Auth/ownership shape follows submitMilestoneAction (apps/web/lib/missions/actions.ts):
-- creators.id is auth.users.id directly (20260614000009_creator_tables.sql), so
-- auth.uid() is compared straight to mission_participants.creator_id, and eligibility is a
-- plain status = 'active' check -- no separate "visitor vs creator" split like claim_offer's
-- (that split exists there because an affiliate link visitor may claim on behalf of a
-- different creator; a receipt submission has no such indirection).
create or replace function public.submit_receipt(
  p_mission_id uuid,
  p_proof_urls text[]
) returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  v_creator_id uuid := auth.uid();
  v_participant_id uuid;
  v_milestone_id uuid;
  v_max_receipts integer;
  v_active_count integer;
  v_mission_type text;
  v_submission_id uuid;
begin
  if v_creator_id is null then raise exception 'unauthorized' using errcode = '42501'; end if;
  if coalesce(array_length(p_proof_urls, 1), 0) = 0 then raise exception 'proof_required'; end if;

  select mission_type, max_receipts_per_creator into v_mission_type, v_max_receipts
    from public.missions
    where id = p_mission_id
    for update;
  if not found then raise exception 'mission_not_found' using errcode = 'P0002'; end if;
  if v_mission_type <> 'receipt_cashback' then raise exception 'wrong_mission_type'; end if;

  select id into v_participant_id
    from public.mission_participants
    where mission_id = p_mission_id and creator_id = v_creator_id and status = 'active';
  if v_participant_id is null then raise exception 'not_active_participant' using errcode = '42501'; end if;

  select id into v_milestone_id
    from public.mission_milestones
    where mission_id = p_mission_id and repeatable = true
    limit 1;
  if v_milestone_id is null then raise exception 'no_repeatable_milestone' using errcode = 'P0002'; end if;
  -- Task 1's create_repeatable_milestone_for_receipt_mission trigger guarantees this row
  -- always exists for a receipt_cashback mission, regardless of how the mission was
  -- created -- this lookup should never actually miss in practice; the guard exists as a
  -- defensive check, not because a real gap is expected here.

  if v_max_receipts is not null then
    select count(*) into v_active_count
      from public.mission_milestone_submissions
      where mission_milestone_id = v_milestone_id
        and mission_participant_id = v_participant_id
        and status in ('submitted', 'approved');
    if v_active_count >= v_max_receipts then
      raise exception 'receipt_cap_reached';
    end if;
  end if;

  insert into public.mission_milestone_submissions (
    mission_milestone_id, mission_participant_id, status, proof_urls, submitted_at
  ) values (
    v_milestone_id, v_participant_id, 'submitted', p_proof_urls, now()
  )
  returning id into v_submission_id;

  return jsonb_build_object('submission_id', v_submission_id);
end;
$$;

revoke all on function public.submit_receipt(uuid, text[]) from public, anon;
grant execute on function public.submit_receipt(uuid, text[]) to authenticated;
