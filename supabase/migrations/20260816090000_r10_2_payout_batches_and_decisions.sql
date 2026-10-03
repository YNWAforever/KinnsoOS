-- supabase/migrations/20260816090000_r10_2_payout_batches_and_decisions.sql
--
-- R10.2: creator_payout_batches + creator_payout_decisions — the payout-promise layer.
--
-- Money already accrues correctly (R10.1 mints mission_settlements rows). This migration
-- adds the layer above individual settlements: an ops-created "batch" that promises to pay
-- a creator a specific amount in a specific currency by a target date, and an append-only
-- decision ledger recording who approved or cancelled that promise and why.
--
-- creator_payout_batches has exactly three states: pending -> paid, pending -> cancelled.
-- Once a batch leaves 'pending' it is immutable — enforced by a trigger below, not just by
-- RPC discipline, because this table is written only by SECURITY DEFINER RPCs and a trigger
-- is the one thing that still catches a bug in those RPCs (the "review_hardening.sql
-- lessons" checklist item from the R10-R13 roadmap's risk table).
--
-- creator_payout_decisions is the append-only ledger of ops judgment calls: 'approved'
-- (fund this batch) or 'cancelled' (undo the promise before it's paid). idempotency_key
-- makes create/cancel safe to replay (a double-submitted form, a retried request) without
-- double-creating or double-cancelling; request_hash lets a same-key replay with a
-- DIFFERENT payload be rejected rather than silently applied. Both tables follow the
-- ops_audit_log precedent: RLS enabled, zero policies, explicit revoke, so anon and
-- authenticated have no access at all. service_role bypasses RLS entirely — a role
-- property, not something a policy can override — and already holds full DML here via
-- 20260613000006_grants.sql's default-privileges grant, so none of this blocks it. What
-- actually guards a misbehaving *trusted* caller (a bug in a future RPC, or a raw
-- service_role script) is the immutability triggers below, which are role-agnostic and
-- fire regardless of who the caller is.

create table public.creator_payout_batches (
  id                        uuid primary key default gen_random_uuid(),
  creator_id                uuid not null references public.creators(id),
  currency                  text not null,
  amount                    numeric not null,
  status                    text not null default 'pending',
  target_at                 timestamptz not null,
  created_by_ops_member_id  uuid not null references public.kinnso_ops_members(id),
  paid_at                   timestamptz,
  cancelled_at              timestamptz,
  created_at                timestamptz not null default now(),
  updated_at                timestamptz not null default now(),
  constraint creator_payout_batches_amount_positive check (amount > 0),
  constraint creator_payout_batches_status_check check (status in ('pending', 'paid', 'cancelled'))
);

-- One pending batch per creator+currency: ops must resolve (pay or cancel) an existing
-- promise before making a new one in the same currency, so nothing is double-promised.
create unique index creator_payout_batches_one_pending_uniq
  on public.creator_payout_batches (creator_id, currency)
  where status = 'pending';

create index creator_payout_batches_creator_idx
  on public.creator_payout_batches (creator_id, created_at desc);

alter table public.creator_payout_batches enable row level security;
revoke all on public.creator_payout_batches from public, anon, authenticated;

create function public.creator_payout_batches_immutable() returns trigger
language plpgsql as $$
begin
  if old.status <> 'pending' then
    raise exception 'batch_immutable';
  end if;
  if new.status not in ('paid', 'cancelled') then
    raise exception 'bad_transition';
  end if;
  if new.status = 'paid' and (new.paid_at is null or new.cancelled_at is not null) then
    raise exception 'bad_transition';
  end if;
  if new.status = 'cancelled' and (new.cancelled_at is null or new.paid_at is not null) then
    raise exception 'bad_transition';
  end if;
  if new.creator_id is distinct from old.creator_id
     or new.currency is distinct from old.currency
     or new.amount is distinct from old.amount
     or new.target_at is distinct from old.target_at
     or new.created_by_ops_member_id is distinct from old.created_by_ops_member_id
     or new.created_at is distinct from old.created_at then
    raise exception 'batch_immutable';
  end if;
  return new;
end;
$$;

create trigger creator_payout_batches_immutable_trg
  before update on public.creator_payout_batches
  for each row execute function public.creator_payout_batches_immutable();

create table public.creator_payout_decisions (
  id                      uuid primary key default gen_random_uuid(),
  payout_batch_id         uuid not null references public.creator_payout_batches(id),
  decision_kind           text not null,
  idempotency_key         text not null,
  request_hash            text not null,
  supersedes_decision_id  uuid references public.creator_payout_decisions(id),
  actor_ops_member_id     uuid not null references public.kinnso_ops_members(id),
  reason                  text not null,
  created_at              timestamptz not null default now(),
  constraint creator_payout_decisions_kind_check check (decision_kind in ('approved', 'cancelled'))
);

create unique index creator_payout_decisions_idempotency_key_uniq
  on public.creator_payout_decisions (idempotency_key);

create index creator_payout_decisions_batch_idx
  on public.creator_payout_decisions (payout_batch_id, created_at desc);

alter table public.creator_payout_decisions enable row level security;
revoke all on public.creator_payout_decisions from public, anon, authenticated;

-- Append-only: no legitimate caller ever updates or deletes a decision row, so both
-- triggers raise unconditionally. This is defense-in-depth — the only inserter is
-- admin_create_payout_batch / admin_cancel_payout, and neither issues UPDATE or DELETE.
create function public.creator_payout_decisions_immutable() returns trigger
language plpgsql as $$
begin
  raise exception 'decision_immutable';
end;
$$;

create trigger creator_payout_decisions_no_update_trg
  before update on public.creator_payout_decisions
  for each row execute function public.creator_payout_decisions_immutable();

create trigger creator_payout_decisions_no_delete_trg
  before delete on public.creator_payout_decisions
  for each row execute function public.creator_payout_decisions_immutable();
