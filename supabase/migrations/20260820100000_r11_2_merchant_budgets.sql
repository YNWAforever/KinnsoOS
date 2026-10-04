-- R11.2 -- merchant budget backing (Adfocate 0024 shape, Kinnso naming). A budget row is
-- created lazily by the first ops credit (admin_credit_merchant_budget upserts); merchants
-- without a row -- and rows with enforced = false -- behave exactly as before this phase.
-- Only definer functions ever write these tables: the client roles get SELECT behind the
-- policies below and nothing else.

create table public.merchant_budgets (
  id                  uuid primary key default gen_random_uuid(),
  merchant_profile_id uuid not null unique references public.merchant_profiles(id) on delete cascade,
  balance             numeric(12,2) not null default 0 check (balance >= 0),
  currency            text not null default 'HKD',
  enforced            boolean not null default false,
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now()
);

-- Append-only ledger. amount is the SIGNED delta (positive topup, negative debit);
-- balance_after snapshots the post-transaction balance so the ledger is self-auditing
-- without replaying. source_ref is the idempotency key -- debits write
-- 'settlement:<settlement id>' and its uniqueness makes any replay a no-op error rather
-- than a double debit; ops credits leave it null (multiple nulls never collide).
create table public.merchant_budget_transactions (
  id                 uuid primary key default gen_random_uuid(),
  merchant_budget_id uuid not null references public.merchant_budgets(id),
  kind               text not null check (kind in ('topup', 'debit', 'adjust')),
  amount             numeric(12,2) not null,
  balance_after      numeric(12,2) not null check (balance_after >= 0),
  source_ref         text unique,
  reason             text,
  created_at         timestamptz not null default now()
);

create index merchant_budget_transactions_budget_idx
  on public.merchant_budget_transactions (merchant_budget_id, created_at desc);

alter table public.merchant_budgets enable row level security;
alter table public.merchant_budget_transactions enable row level security;

-- Owning merchant (via merchant_profiles.user_id) or any active ops member reads.
create policy merchant_budgets_select on public.merchant_budgets
  for select
  to authenticated
  using (
    exists (
      select 1 from public.merchant_profiles mp
      where mp.id = merchant_budgets.merchant_profile_id
        and mp.user_id = (select auth.uid())
    )
    or exists (
      select 1 from public.kinnso_ops_members ops
      where ops.user_id = (select auth.uid())
        and ops.status = 'active'
    )
  );

create policy merchant_budget_transactions_select on public.merchant_budget_transactions
  for select
  to authenticated
  using (
    exists (
      select 1
      from public.merchant_budgets b
      join public.merchant_profiles mp on mp.id = b.merchant_profile_id
      where b.id = merchant_budget_transactions.merchant_budget_id
        and mp.user_id = (select auth.uid())
    )
    or exists (
      select 1 from public.kinnso_ops_members ops
      where ops.user_id = (select auth.uid())
        and ops.status = 'active'
    )
  );

revoke all on public.merchant_budgets from public, anon, authenticated;
revoke all on public.merchant_budget_transactions from public, anon, authenticated;
grant select on public.merchant_budgets to authenticated;
grant select on public.merchant_budget_transactions to authenticated;
