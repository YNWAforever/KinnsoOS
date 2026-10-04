-- Phase 10D — Creators Operator Console: Payouts.
-- Single audited write path for ops marking settlement progress. SECURITY DEFINER,
-- gated on is_active_ops(), reason required (money-touching), appends an ops_audit_log
-- row (entity_type='settlement') in the same transaction via the 10A helper. Enforces
-- the transition matrix in docs/superpowers/plans/2026-06-29-phase10d-payouts.md:
--   overall status completeness rank not_started<pending<partially_paid<paid; 'disputed'
--   is a side-state; forward + (to/from disputed) always allowed; backward needs
--   p_allow_revert. Legs (pending|paid): pending->paid always; paid->pending needs revert.
-- The legacy direct-write path (lib/missions updateSettlementAction / /ops/settlements)
-- is intentionally untouched; this adds the audited path.

create or replace function public.admin_set_settlement_status(
  p_id                          uuid,
  p_status                      text default null,
  p_creator_payout_status       text default null,
  p_kinnso_commission_status    text default null,
  p_affiliate_commission_status text default null,
  p_allow_revert                boolean default false,
  p_reason                      text default null
) returns void language plpgsql security definer set search_path = public as $$
declare
  v_status text; v_cp text; v_kc text; v_ac text;
  v_changed jsonb := '{}'::jsonb;
  v_rank_to int; v_rank_from int;
begin
  if not public.is_active_ops() then raise exception 'forbidden' using errcode = '42501'; end if;
  if coalesce(btrim(p_reason), '') = '' then raise exception 'reason_required'; end if;
  if length(btrim(p_reason)) > 500 then raise exception 'reason_too_long'; end if;
  if p_status is null
     and p_creator_payout_status is null
     and p_kinnso_commission_status is null
     and p_affiliate_commission_status is null then
    raise exception 'no_change';
  end if;

  select status, creator_payout_status, kinnso_commission_status, affiliate_commission_status
    into v_status, v_cp, v_kc, v_ac
    from public.mission_settlements where id = p_id for update;
  if not found then raise exception 'not_found'; end if;

  -- Overall status.
  if p_status is not null and p_status is distinct from v_status then
    if p_status not in ('not_started','pending','partially_paid','paid','disputed') then
      raise exception 'bad_status';
    end if;
    v_rank_to   := case p_status when 'not_started' then 0 when 'pending' then 1 when 'partially_paid' then 2 when 'paid' then 3 else -1 end;
    v_rank_from := case v_status when 'not_started' then 0 when 'pending' then 1 when 'partially_paid' then 2 when 'paid' then 3 else -1 end;
    if p_status <> 'disputed' and v_status <> 'disputed'
       and v_rank_to < v_rank_from and not coalesce(p_allow_revert, false) then
      raise exception 'bad_transition';
    end if;
    v_changed := v_changed || jsonb_build_object('status', jsonb_build_object('from', v_status, 'to', p_status));
  end if;

  -- Creator payout leg.
  if p_creator_payout_status is not null and p_creator_payout_status is distinct from v_cp then
    if p_creator_payout_status not in ('pending','paid') then raise exception 'bad_leg_status'; end if;
    if v_cp = 'paid' and p_creator_payout_status = 'pending' and not coalesce(p_allow_revert, false) then
      raise exception 'bad_transition';
    end if;
    v_changed := v_changed || jsonb_build_object('creator_payout_status', jsonb_build_object('from', v_cp, 'to', p_creator_payout_status));
  end if;

  -- Kinnso commission leg.
  if p_kinnso_commission_status is not null and p_kinnso_commission_status is distinct from v_kc then
    if p_kinnso_commission_status not in ('pending','paid') then raise exception 'bad_leg_status'; end if;
    if v_kc = 'paid' and p_kinnso_commission_status = 'pending' and not coalesce(p_allow_revert, false) then
      raise exception 'bad_transition';
    end if;
    v_changed := v_changed || jsonb_build_object('kinnso_commission_status', jsonb_build_object('from', v_kc, 'to', p_kinnso_commission_status));
  end if;

  -- Affiliate commission leg.
  if p_affiliate_commission_status is not null and p_affiliate_commission_status is distinct from v_ac then
    if p_affiliate_commission_status not in ('pending','paid') then raise exception 'bad_leg_status'; end if;
    if v_ac = 'paid' and p_affiliate_commission_status = 'pending' and not coalesce(p_allow_revert, false) then
      raise exception 'bad_transition';
    end if;
    v_changed := v_changed || jsonb_build_object('affiliate_commission_status', jsonb_build_object('from', v_ac, 'to', p_affiliate_commission_status));
  end if;

  if v_changed = '{}'::jsonb then raise exception 'no_change'; end if;

  update public.mission_settlements set
    status                      = coalesce(p_status, status),
    creator_payout_status       = coalesce(p_creator_payout_status, creator_payout_status),
    kinnso_commission_status    = coalesce(p_kinnso_commission_status, kinnso_commission_status),
    affiliate_commission_status = coalesce(p_affiliate_commission_status, affiliate_commission_status),
    ops_note                    = btrim(p_reason),
    updated_by_ops_member_id    = (select id from public.kinnso_ops_members where user_id = auth.uid() and status = 'active'),
    updated_at                  = now()
  where id = p_id;

  perform public.ops_audit_log_append('settlement', p_id, 'settlement.status', p_reason,
    v_changed || jsonb_build_object('allow_revert', coalesce(p_allow_revert, false)));
end $$;

-- Grants: revoke implicit public+anon EXECUTE, grant authenticated only (RPC self-gates).
revoke all on function public.admin_set_settlement_status(uuid, text, text, text, text, boolean, text) from public, anon;
grant execute on function public.admin_set_settlement_status(uuid, text, text, text, text, boolean, text) to authenticated;
