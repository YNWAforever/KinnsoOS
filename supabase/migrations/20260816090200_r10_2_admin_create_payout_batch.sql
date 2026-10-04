-- supabase/migrations/20260816090200_r10_2_admin_create_payout_batch.sql
--
-- R10.2: admin_create_payout_batch — the sole way a pending payout promise gets made.
--
-- Idempotency: the caller supplies p_idempotency_key (a client-generated value tied to one
-- "Create batch" form submission — see the TypeScript layer in a later task). request_hash is
-- computed here from the call's own arguments so a replay with an IDENTICAL payload is a
-- safe no-op (returns the original batch, 'replayed': true) while a replay with a
-- DIFFERENT payload under the same key is rejected with 'idempotency_conflict' — this is
-- what makes a double-submitted or retried form safe without asking ops to dedupe by hand.
-- md5() is used rather than pgcrypto's digest() because it needs no extension and this is
-- an internal collision check, not a security boundary.
--
-- Concurrency: the idempotency-key lookup takes `for update`, but that only locks a row
-- that already exists — it cannot protect against two never-before-seen keys racing each
-- other, since Postgres has no gap locks. Two truly simultaneous first-time callers with the
-- same key CAN both fall through to the insert branch below; the begin/exception block
-- around those inserts is what makes that race safe, by catching the loser's unique_violation
-- and reconciling it into the same replay/conflict result the lookup above would have given.

create or replace function public.admin_create_payout_batch(
  p_creator_id      uuid,
  p_currency        text,
  p_amount          numeric,
  p_idempotency_key text,
  p_reason          text,
  p_target_at       timestamptz default null
) returns jsonb language plpgsql security definer set search_path = public as $$
declare
  v_actor uuid;
  v_hash text;
  v_existing record;
  v_batch_id uuid;
  v_decision_id uuid;
  v_target timestamptz;
begin
  if not public.is_active_ops_role('admin') then
    raise exception 'forbidden' using errcode = '42501';
  end if;
  if coalesce(btrim(p_reason), '') = '' then raise exception 'reason_required'; end if;
  if length(btrim(p_reason)) > 500 then raise exception 'reason_too_long'; end if;
  if p_creator_id is null then raise exception 'creator_required'; end if;
  if coalesce(btrim(p_currency), '') = '' then raise exception 'currency_required'; end if;
  if p_amount is null or p_amount <= 0 then raise exception 'bad_amount'; end if;
  if coalesce(btrim(p_idempotency_key), '') = '' then raise exception 'idempotency_key_required'; end if;
  if p_target_at is not null and p_target_at < now() then raise exception 'target_at_in_past'; end if;

  select id into v_actor from public.kinnso_ops_members where user_id = auth.uid() and status = 'active';

  v_hash := md5(concat_ws('|', p_creator_id::text, upper(p_currency), p_amount::text, coalesce(p_target_at::text, '')));

  select d.id as decision_id, d.request_hash, d.payout_batch_id
    into v_existing
    from public.creator_payout_decisions d
    where d.idempotency_key = p_idempotency_key
    for update;

  if found then
    if v_existing.request_hash <> v_hash then
      raise exception 'idempotency_conflict';
    end if;
    return jsonb_build_object('batch_id', v_existing.payout_batch_id, 'decision_id', v_existing.decision_id, 'replayed', true);
  end if;

  if exists (
    select 1 from public.creator_payout_batches
    where creator_id = p_creator_id and currency = upper(p_currency) and status = 'pending'
  ) then
    raise exception 'batch_already_pending';
  end if;

  v_target := coalesce(p_target_at, now() + make_interval(days => public.payout_processing_window_days()));

  -- A concurrent call carrying the same never-before-seen idempotency_key can still reach
  -- this point (the `for update` lock above cannot lock a row that doesn't exist yet). This
  -- begin/exception block is a PL/pgSQL subtransaction: if the decisions insert loses the
  -- race on creator_payout_decisions_idempotency_key_uniq, everything inside this block --
  -- including the batch row just inserted -- is rolled back automatically, and the handler
  -- re-reads the winner's now-committed row to return the same replay/conflict result the
  -- lookup above would have given had it simply run a moment later.
  begin
    insert into public.creator_payout_batches (creator_id, currency, amount, target_at, created_by_ops_member_id)
      values (p_creator_id, upper(p_currency), p_amount, v_target, v_actor)
      returning id into v_batch_id;

    insert into public.creator_payout_decisions
      (payout_batch_id, decision_kind, idempotency_key, request_hash, actor_ops_member_id, reason)
      values (v_batch_id, 'approved', p_idempotency_key, v_hash, v_actor, btrim(p_reason))
      returning id into v_decision_id;
  exception
    when unique_violation then
      select d.id as decision_id, d.request_hash, d.payout_batch_id
        into v_existing
        from public.creator_payout_decisions d
        where d.idempotency_key = p_idempotency_key;

      if not found then
        -- The violation was on a different constraint (e.g. the creator+currency
        -- pending-batch index) -- re-raise as-is rather than claiming a replay that isn't
        -- real. That race is a separate, known, unhandled case -- out of scope for this fix.
        raise;
      end if;

      if v_existing.request_hash <> v_hash then
        raise exception 'idempotency_conflict';
      end if;
      return jsonb_build_object('batch_id', v_existing.payout_batch_id, 'decision_id', v_existing.decision_id, 'replayed', true);
  end;

  perform public.ops_audit_log_append('payout_batch', v_batch_id, 'payout_batch.create', p_reason,
    jsonb_build_object('creator_id', p_creator_id, 'currency', upper(p_currency), 'amount', p_amount, 'target_at', v_target));

  return jsonb_build_object('batch_id', v_batch_id, 'decision_id', v_decision_id, 'replayed', false);
end;
$$;

revoke all on function public.admin_create_payout_batch(uuid, text, numeric, text, text, timestamptz) from public, anon;
grant execute on function public.admin_create_payout_batch(uuid, text, numeric, text, text, timestamptz) to authenticated;
