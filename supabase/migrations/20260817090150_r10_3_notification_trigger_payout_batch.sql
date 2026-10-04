-- supabase/migrations/20260817090150_r10_3_notification_trigger_payout_batch.sql
--
-- R10.3 Task 2b: the third of three notification trigger functions (see the plan's Task 2
-- for the other two, and its amendment header for why this one is split into its own file).
-- This trigger fires on public.creator_payout_batches, a table that does not exist on this
-- branch's migration history yet -- it ships separately on R10.2 (still an open PR as of this
-- writing). This migration is correct, complete SQL that will apply cleanly once this branch's
-- history is combined with R10.2's, but it is NOT live-verified here: only a text/string
-- contract test runs against this file in this task. Live behavioral verification (actually
-- applying this migration and firing the trigger against a running Postgres instance) is
-- deferred to Task 8, gated on R10.2 having merged first.
--
-- As with the other two trigger functions, the insert into notifications is wrapped in its
-- own begin/exception block scoped to just the insert, per Adfocate 0022's "NEVER roll back
-- the earn loop" -- a notification failure must never fail the payout batch mutation that
-- triggered it.

create or replace function public.notify_payout_batch_change() returns trigger
language plpgsql security definer set search_path = public as $$
declare
  v_type text;
begin
  if tg_op = 'INSERT' then
    v_type := 'payout_batch.created';
  elsif new.status is distinct from old.status then
    v_type := case new.status
      when 'paid' then 'payout_batch.paid'
      when 'cancelled' then 'payout_batch.cancelled'
      else null
    end;
  else
    return new;
  end if;

  if v_type is null then return new; end if;

  begin
    insert into public.notifications (creator_id, notification_type, entity_type, entity_id, payload)
    values (new.creator_id, v_type, 'payout_batch', new.id,
      jsonb_build_object('currency', new.currency, 'amount', new.amount));
  exception when others then null;
  end;

  return new;
end;
$$;

create trigger notify_payout_batch_change_trg
  after insert or update on public.creator_payout_batches
  for each row execute function public.notify_payout_batch_change();

revoke all on function public.notify_payout_batch_change() from public, anon, authenticated, service_role;
