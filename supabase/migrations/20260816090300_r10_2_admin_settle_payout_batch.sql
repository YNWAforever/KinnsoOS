-- supabase/migrations/20260816090300_r10_2_admin_settle_payout_batch.sql
--
-- R10.2: the two ways a pending batch resolves — paid or cancelled.
--
-- admin_mark_payout_paid records that ops actually sent the money on whatever rail they
-- used (manual transfer, Stripe Connect, etc. — R10.2 is deliberately rail-agnostic per the
-- roadmap; this RPC records the promise being kept, not how). It is a plain CAS on status,
-- audited, with no decision row: there is no ops *judgment call* to record beyond the audit
-- log entry — the judgment call already happened at admin_create_payout_batch.
--
-- admin_cancel_payout undoes a still-pending promise before it's paid, and DOES write a
-- 'cancelled' decision row (it IS a judgment call, symmetric with 'approved'), superseding
-- the batch's original approval so the ledger reads as one continuous decision chain per
-- batch. It takes the same idempotency_key/request_hash treatment as create, for the same
-- reason: a double-submitted cancel must not silently behave differently depending on when
-- the retry lands.

create or replace function public.admin_mark_payout_paid(p_batch_id uuid, p_reason text)
returns void language plpgsql security definer set search_path = public as $$
declare
  v_status text;
begin
  if not public.is_active_ops_role('admin') then
    raise exception 'forbidden' using errcode = '42501';
  end if;
  if coalesce(btrim(p_reason), '') = '' then raise exception 'reason_required'; end if;
  if length(btrim(p_reason)) > 500 then raise exception 'reason_too_long'; end if;

  select status into v_status from public.creator_payout_batches where id = p_batch_id for update;
  if not found then raise exception 'not_found'; end if;
  if v_status <> 'pending' then raise exception 'bad_transition'; end if;

  update public.creator_payout_batches
    set status = 'paid', paid_at = now(), updated_at = now()
    where id = p_batch_id;

  perform public.ops_audit_log_append('payout_batch', p_batch_id, 'payout_batch.paid', p_reason, '{}'::jsonb);
end;
$$;
revoke all on function public.admin_mark_payout_paid(uuid, text) from public, anon;
grant execute on function public.admin_mark_payout_paid(uuid, text) to authenticated;

create or replace function public.admin_cancel_payout(
  p_batch_id        uuid,
  p_idempotency_key text,
  p_reason          text
) returns jsonb language plpgsql security definer set search_path = public as $$
declare
  v_actor uuid;
  v_hash text;
  v_existing record;
  v_status text;
  v_approved_decision_id uuid;
  v_decision_id uuid;
begin
  if not public.is_active_ops_role('admin') then
    raise exception 'forbidden' using errcode = '42501';
  end if;
  if coalesce(btrim(p_reason), '') = '' then raise exception 'reason_required'; end if;
  if length(btrim(p_reason)) > 500 then raise exception 'reason_too_long'; end if;
  if coalesce(btrim(p_idempotency_key), '') = '' then raise exception 'idempotency_key_required'; end if;

  select id into v_actor from public.kinnso_ops_members where user_id = auth.uid() and status = 'active';
  v_hash := md5(concat_ws('|', p_batch_id::text, 'cancel'));

  select d.id as decision_id, d.request_hash
    into v_existing
    from public.creator_payout_decisions d
    where d.idempotency_key = p_idempotency_key
    for update;

  if found then
    if v_existing.request_hash <> v_hash then
      raise exception 'idempotency_conflict';
    end if;
    return jsonb_build_object('decision_id', v_existing.decision_id, 'replayed', true);
  end if;

  select status into v_status from public.creator_payout_batches where id = p_batch_id for update;
  if not found then raise exception 'not_found'; end if;
  if v_status <> 'pending' then raise exception 'bad_transition'; end if;

  select id into v_approved_decision_id
    from public.creator_payout_decisions
    where payout_batch_id = p_batch_id and decision_kind = 'approved'
    order by created_at desc limit 1;

  -- Same-batch concurrent cancels are already safe without a subtransaction: the `for
  -- update` lock taken above when reading v_status serializes them on that row, so a losing
  -- call simply observes status <> 'pending' after the winner commits and raises the
  -- ordinary 'bad_transition' error -- no raw DB error ever reaches the caller. What that
  -- lock cannot prevent is two concurrent calls sharing the same never-before-seen
  -- idempotency_key but targeting DIFFERENT batch ids (a client bug, not a legitimate
  -- retry): they lock different batch rows, never contend with each other, and can both
  -- reach the insert below, racing on creator_payout_decisions_idempotency_key_uniq.
  --
  -- The block below wraps the UPDATE together with the INSERT -- not the insert alone. If
  -- only the insert were wrapped, a losing call's update (already executed outside the
  -- block, and therefore not covered by the block's own savepoint) risks surviving while
  -- its insert rolls back, leaving a batch permanently stuck at status = 'cancelled' with no
  -- corresponding decision row -- and Task 1's immutability
  -- trigger (`old.status <> 'pending' -> batch_immutable`) means no further update to that
  -- row is ever possible again, which would be worse than the bug being fixed here.
  -- Wrapping both together makes the transition atomic: on unique_violation, everything
  -- inside this block -- including the update that already ran -- is rolled back
  -- automatically, and the handler re-reads the winner's now-committed row to return the
  -- same replay/conflict result the idempotency-key lookup above would have given had it
  -- simply run a moment later.
  begin
    update public.creator_payout_batches
      set status = 'cancelled', cancelled_at = now(), updated_at = now()
      where id = p_batch_id;

    insert into public.creator_payout_decisions
      (payout_batch_id, decision_kind, idempotency_key, request_hash, supersedes_decision_id, actor_ops_member_id, reason)
      values (p_batch_id, 'cancelled', p_idempotency_key, v_hash, v_approved_decision_id, v_actor, btrim(p_reason))
      returning id into v_decision_id;
  exception
    when unique_violation then
      select d.id as decision_id, d.request_hash
        into v_existing
        from public.creator_payout_decisions d
        where d.idempotency_key = p_idempotency_key;

      if not found then
        -- Unreachable in practice: creator_payout_decisions has exactly one unique
        -- constraint (idempotency_key), and this UPDATE is exempt from
        -- creator_payout_batches_one_pending_uniq once status leaves 'pending', so no other
        -- constraint on either table can be the one that fired. Kept anyway for
        -- forward-compatibility and consistency with admin_create_payout_batch's identical
        -- guard.
        raise;
      end if;

      if v_existing.request_hash <> v_hash then
        raise exception 'idempotency_conflict';
      end if;
      return jsonb_build_object('decision_id', v_existing.decision_id, 'replayed', true);
  end;

  perform public.ops_audit_log_append('payout_batch', p_batch_id, 'payout_batch.cancel', p_reason, '{}'::jsonb);

  return jsonb_build_object('decision_id', v_decision_id, 'replayed', false);
end;
$$;
revoke all on function public.admin_cancel_payout(uuid, text, text) from public, anon;
grant execute on function public.admin_cancel_payout(uuid, text, text) to authenticated;
