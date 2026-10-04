-- supabase/migrations/20260704150000_r3b_admin_settlement_status_rpc.sql

create or replace function public.admin_set_booking_settlement_status(
  p_id uuid,
  p_status text default null,
  p_merchant_payout_status text default null,
  p_creator_commission_status text default null,
  p_kinnso_commission_status text default null,
  p_allow_revert boolean default false,
  p_reason text default null
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_status text; v_mp text; v_cc text; v_kc text;
  v_changed jsonb := '{}'::jsonb;
  v_rank_to int; v_rank_from int;
begin
  if not public.is_active_ops_role('admin') then
    raise exception 'forbidden' using errcode = '42501';
  end if;
  if coalesce(btrim(p_reason), '') = '' then raise exception 'reason_required'; end if;
  if length(btrim(p_reason)) > 500 then raise exception 'reason_too_long'; end if;
  if p_status is null and p_merchant_payout_status is null
     and p_creator_commission_status is null and p_kinnso_commission_status is null then
    raise exception 'no_change';
  end if;

  select status, merchant_payout_status, creator_commission_status, kinnso_commission_status
    into v_status, v_mp, v_cc, v_kc
    from public.booking_settlements where id = p_id for update;
  if not found then raise exception 'not_found'; end if;

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

  if p_merchant_payout_status is not null and p_merchant_payout_status is distinct from v_mp then
    if p_merchant_payout_status not in ('pending','paid') then raise exception 'bad_leg_status'; end if;
    if v_mp = 'paid' and p_merchant_payout_status = 'pending' and not coalesce(p_allow_revert, false) then
      raise exception 'bad_transition';
    end if;
    v_changed := v_changed || jsonb_build_object('merchant_payout_status', jsonb_build_object('from', v_mp, 'to', p_merchant_payout_status));
  end if;

  if p_creator_commission_status is not null and p_creator_commission_status is distinct from v_cc then
    if v_cc is null then raise exception 'no_creator_leg'; end if;
    if p_creator_commission_status not in ('pending','paid') then raise exception 'bad_leg_status'; end if;
    if v_cc = 'paid' and p_creator_commission_status = 'pending' and not coalesce(p_allow_revert, false) then
      raise exception 'bad_transition';
    end if;
    v_changed := v_changed || jsonb_build_object('creator_commission_status', jsonb_build_object('from', v_cc, 'to', p_creator_commission_status));
  end if;

  if p_kinnso_commission_status is not null and p_kinnso_commission_status is distinct from v_kc then
    if p_kinnso_commission_status not in ('pending','paid') then raise exception 'bad_leg_status'; end if;
    if v_kc = 'paid' and p_kinnso_commission_status = 'pending' and not coalesce(p_allow_revert, false) then
      raise exception 'bad_transition';
    end if;
    v_changed := v_changed || jsonb_build_object('kinnso_commission_status', jsonb_build_object('from', v_kc, 'to', p_kinnso_commission_status));
  end if;

  if v_changed = '{}'::jsonb then raise exception 'no_change'; end if;

  update public.booking_settlements set
    status                     = coalesce(p_status, status),
    merchant_payout_status     = coalesce(p_merchant_payout_status, merchant_payout_status),
    creator_commission_status  = coalesce(p_creator_commission_status, creator_commission_status),
    kinnso_commission_status   = coalesce(p_kinnso_commission_status, kinnso_commission_status),
    ops_note                   = btrim(p_reason),
    updated_by_ops_member_id   = (select id from public.kinnso_ops_members where user_id = auth.uid() and status = 'active'),
    updated_at                 = now()
  where id = p_id;

  perform public.ops_audit_log_append('booking_settlement', p_id, 'booking_settlement.status', p_reason,
    v_changed || jsonb_build_object('allow_revert', coalesce(p_allow_revert, false)));
end;
$$;

revoke all on function public.admin_set_booking_settlement_status from public, anon, authenticated;
grant execute on function public.admin_set_booking_settlement_status to authenticated;
