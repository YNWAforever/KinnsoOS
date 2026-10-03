create table public.booking_settlements (
  id uuid primary key default gen_random_uuid(),
  booking_id uuid not null unique references public.bookings(id) on delete cascade,
  status text not null default 'not_started'
    check (status in ('not_started','pending','partially_paid','paid','disputed')),
  merchant_payout_status text not null default 'pending'
    check (merchant_payout_status in ('pending','paid')),
  merchant_payout_amount numeric not null check (merchant_payout_amount >= 0),
  creator_commission_status text
    check (creator_commission_status in ('pending','paid')),
  creator_commission_amount numeric check (creator_commission_amount >= 0),
  kinnso_commission_status text not null default 'pending'
    check (kinnso_commission_status in ('pending','paid')),
  kinnso_commission_amount numeric not null check (kinnso_commission_amount >= 0),
  currency text not null,
  updated_by_ops_member_id uuid references public.kinnso_ops_members(id),
  ops_note text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.booking_settlements enable row level security;

create policy booking_settlements_ops_all on public.booking_settlements
  for all
  to authenticated
  using (public.is_active_ops())
  with check (public.is_active_ops());

-- Trigger: auto-create the settlement row the instant a booking is confirmed.
-- Fires regardless of which code path performs the confirmation (today: only
-- confirm_booking_from_webhook(); this is deliberately a NEW trigger rather than an
-- edit to that already-shipped, already-reviewed function — do not modify
-- confirm_booking_from_webhook() as part of this task).
create or replace function public.create_booking_settlement_on_confirm()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_kinnso_rate constant numeric := 0.10;
  v_creator_rate constant numeric := 0.10;
  v_creator_amount numeric;
  v_kinnso_amount numeric;
  v_merchant_amount numeric;
begin
  if new.status = 'confirmed' and old.status = 'pending_payment' then
    v_kinnso_amount := round(new.total_amount * v_kinnso_rate, 2);

    if new.creator_id is not null then
      v_creator_amount := round(new.total_amount * v_creator_rate, 2);
    else
      v_creator_amount := null;
    end if;

    v_merchant_amount := new.total_amount - v_kinnso_amount - coalesce(v_creator_amount, 0);

    insert into public.booking_settlements (
      booking_id, merchant_payout_amount, creator_commission_amount,
      creator_commission_status, kinnso_commission_amount, currency
    ) values (
      new.id, v_merchant_amount, v_creator_amount,
      case when new.creator_id is not null then 'pending' else null end,
      v_kinnso_amount, new.currency
    )
    on conflict (booking_id) do nothing;

    insert into public.booking_events (booking_id, event_type, metadata)
    values (new.id, 'settlement_created', jsonb_build_object(
      'merchant_payout_amount', v_merchant_amount,
      'creator_commission_amount', v_creator_amount,
      'kinnso_commission_amount', v_kinnso_amount
    ));
  end if;
  return new;
end;
$$;

create trigger booking_settlement_on_confirm
  after update of status on public.bookings
  for each row
  execute function public.create_booking_settlement_on_confirm();
