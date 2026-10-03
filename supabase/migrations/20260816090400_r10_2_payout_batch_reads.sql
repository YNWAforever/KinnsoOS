-- supabase/migrations/20260816090400_r10_2_payout_batch_reads.sql
--
-- R10.2: the two read paths onto creator_payout_batches. RLS on that table has zero
-- policies (20260816090000), so every read — including a creator's own — is RPC-only.
--
-- creator_payout_batches_mine mirrors creator_earnings_summary()'s gate exactly (R10.0,
-- 20260815090000): active creators only, SECURITY DEFINER.
--
-- admin_list_payout_batches is gated at 'analyst' (the read tier), not 'admin' (the tier
-- that creates/cancels) — matching admin_creator_analytics's own precedent that reading
-- ops-aggregate data has a lower bar than mutating it.

create or replace function public.creator_payout_batches_mine()
returns jsonb language plpgsql stable security definer set search_path = public as $$
declare
  v_uid uuid := auth.uid();
begin
  if not exists (select 1 from public.creators where id = v_uid and status = 'active') then
    raise exception 'forbidden' using errcode = '42501';
  end if;

  return coalesce((
    select jsonb_agg(jsonb_build_object(
      'id',           b.id,
      'currency',     b.currency,
      'amount',       b.amount,
      'status',       b.status,
      'target_at',    b.target_at,
      'created_at',   b.created_at,
      'paid_at',      b.paid_at,
      'cancelled_at', b.cancelled_at
    ) order by b.created_at desc)
    from public.creator_payout_batches b
    where b.creator_id = v_uid
  ), '[]'::jsonb);
end;
$$;
revoke all on function public.creator_payout_batches_mine() from public, anon, authenticated;
grant execute on function public.creator_payout_batches_mine() to authenticated;

create or replace function public.admin_list_payout_batches(p_status text default null)
returns jsonb language plpgsql stable security definer set search_path = public as $$
begin
  if not public.is_active_ops_role('analyst') then
    raise exception 'forbidden' using errcode = '42501';
  end if;
  if p_status is not null and p_status not in ('pending', 'paid', 'cancelled') then
    raise exception 'bad_status';
  end if;

  return coalesce((
    select jsonb_agg(jsonb_build_object(
      'id',           b.id,
      'creator_id',   b.creator_id,
      'creator_name', c.display_name,
      'currency',     b.currency,
      'amount',       b.amount,
      'status',       b.status,
      'target_at',    b.target_at,
      'created_at',   b.created_at,
      'paid_at',      b.paid_at,
      'cancelled_at', b.cancelled_at
    ) order by b.created_at desc)
    from public.creator_payout_batches b
    join public.creators c on c.id = b.creator_id
    where p_status is null or b.status = p_status
  ), '[]'::jsonb);
end;
$$;
revoke all on function public.admin_list_payout_batches(text) from public, anon;
grant execute on function public.admin_list_payout_batches(text) to authenticated;
