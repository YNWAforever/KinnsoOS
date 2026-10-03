-- R11.2 -- the funding gate. AFTER INSERT on mission_settlements, so it fires exactly when
-- R10.1's create_mission_settlement_on_approval mints a fee obligation -- and ONLY for rows
-- actually inserted: the mint's `on conflict do nothing` dedupe means a revision-flap
-- re-approval never reaches this function, so a double debit is structurally impossible
-- without duplicating any of the mint's own guard logic here.
--
-- A raise below aborts the whole transaction: the settlement insert AND the approval UPDATE
-- that caused it, on every approval path (merchant plain update, admin_review_submission,
-- and the R11.1 auto-approve trigger -- whose own exception handler downgrades the abort to
-- a logged warning, correctly leaving the submission in the queue). Unlike the
-- notification-style triggers, this one deliberately has NO exception handler -- blocking
-- the transaction is its entire job.
--
-- Fee-settlement guard mirrors the mint trigger's own output shape: a fee settlement has a
-- participant, no affiliate event, and a positive paid_fee_amount. Affiliate and booking
-- settlements never match.
create or replace function public.debit_merchant_budget_on_settlement() returns trigger
language plpgsql security definer set search_path = public as $$
declare
  v_merchant_profile_id uuid;
  v_budget_id           uuid;
  v_balance             numeric;
  v_currency            text;
  v_enforced            boolean;
begin
  if new.mission_participant_id is null or new.affiliate_network_event_id is not null then return new; end if;
  if new.paid_fee_amount is null or new.paid_fee_amount <= 0 then return new; end if;

  select m.merchant_profile_id into v_merchant_profile_id
    from public.missions m where m.id = new.mission_id;
  if v_merchant_profile_id is null then return new; end if;

  -- Lock the budget row so concurrent approvals against the same budget serialize; the
  -- lock is only taken when a row exists, and enforcement is re-read under the lock.
  select b.id, b.balance, b.currency, b.enforced
    into v_budget_id, v_balance, v_currency, v_enforced
    from public.merchant_budgets b
    where b.merchant_profile_id = v_merchant_profile_id
    for update;
  if not found or not v_enforced then return new; end if;

  if v_currency is distinct from upper(coalesce(new.amount_currency, 'HKD')) then
    raise exception 'currency_mismatch';
  end if;
  if v_balance < new.paid_fee_amount then
    raise exception 'insufficient_budget';
  end if;

  update public.merchant_budgets
    set balance = balance - new.paid_fee_amount, updated_at = now()
    where id = v_budget_id;

  insert into public.merchant_budget_transactions (merchant_budget_id, kind, amount, balance_after, source_ref)
    values (v_budget_id, 'debit', -new.paid_fee_amount, v_balance - new.paid_fee_amount, 'settlement:' || new.id);

  return new;
end;
$$;

revoke all on function public.debit_merchant_budget_on_settlement()
  from public, anon, authenticated, service_role;

create trigger debit_merchant_budget_on_settlement_trg
  after insert on public.mission_settlements
  for each row execute function public.debit_merchant_budget_on_settlement();
