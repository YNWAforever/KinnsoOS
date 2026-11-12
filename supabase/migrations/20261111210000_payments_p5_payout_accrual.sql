-- P5g: monthly creator payout accrual from owned bookings.
--
-- Payments are live-ready but there is still no way for the owner to know what each
-- creator is owed for a month, or to record that the manual bank transfer happened.
-- `booking_payments` already stores the 15% `commission_minor` taken at booking time;
-- this migration turns paid payments into a per-creator monthly accrual and records the
-- manual payout against the existing (unused) `creator_payouts` table.
--
-- Contract: one payout per creator per calendar month, recorded only after the money was
-- transferred (status `paid`, bank reference required). Refunded payments are excluded
-- from the accrual, so a payout run taken after a refund never pays it out. The payout
-- period is normalised to a whole calendar month, which also makes overlapping
-- (double-paying) periods impossible. Corrections after a payout are manual.
alter table public.creator_payouts
  add column if not exists currency char(3) not null default 'HKD',
  add column if not exists reference text,
  add column if not exists note text,
  add column if not exists paid_at timestamptz,
  add column if not exists created_by uuid references auth.users(id);
alter table public.creator_payouts drop constraint if exists creator_payouts_amounts_check;
alter table public.creator_payouts add constraint creator_payouts_amounts_check
  check (gross_minor >= 0 and commission_minor >= 0 and net_minor = gross_minor - commission_minor);
alter table public.creator_payouts drop constraint if exists creator_payouts_period_check;
alter table public.creator_payouts add constraint creator_payouts_period_check check (period_start <= period_end);
alter table public.creator_payouts drop constraint if exists creator_payouts_paid_reference_check;
alter table public.creator_payouts add constraint creator_payouts_paid_reference_check
  check (status <> 'paid' or (reference is not null and char_length(btrim(reference)) between 3 and 200));
create unique index if not exists creator_payouts_creator_period_uidx
  on public.creator_payouts (creator_id, period_start, period_end);

create or replace function kinnso_internal.creator_payout_month(p_month date)
returns table(month_start date, month_end date) language sql stable as $$
  select date_trunc('month', coalesce(p_month, current_date))::date,
         (date_trunc('month', coalesce(p_month, current_date)) + interval '1 month - 1 day')::date
$$;

create or replace function public.kinnso_ops_payout_accrual(p_month date default null) returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare
  v_period record;
  v_creators jsonb;
  v_gross bigint := 0;
  v_commission bigint := 0;
  v_net bigint := 0;
  v_count bigint := 0;
begin
  if not public.is_active_ops() then raise exception 'forbidden' using errcode = '42501'; end if;
  select * into v_period from kinnso_internal.creator_payout_month(p_month);
  select coalesce(jsonb_agg(jsonb_build_object(
      'creatorId', a.creator_id,
      'creatorName', coalesce(c.display_name, ''),
      'currency', a.currency,
      'grossMinor', a.gross_minor,
      'commissionMinor', a.commission_minor,
      'netMinor', a.net_minor,
      'paymentCount', a.payment_count,
      'payout', case when p.id is null then null else jsonb_build_object(
        'id', p.id, 'status', p.status, 'reference', p.reference,
        'paidAt', p.paid_at, 'netMinor', p.net_minor) end
    ) order by coalesce(c.display_name, ''), a.creator_id), '[]'::jsonb),
    coalesce(sum(a.gross_minor), 0), coalesce(sum(a.commission_minor), 0),
    coalesce(sum(a.net_minor), 0), coalesce(sum(a.payment_count), 0)
    into v_creators, v_gross, v_commission, v_net, v_count
    from (
      select bp.creator_id, btrim(bp.currency::text) as currency,
             sum(bp.amount_minor)::bigint as gross_minor,
             sum(bp.commission_minor)::bigint as commission_minor,
             sum(bp.amount_minor - bp.commission_minor)::bigint as net_minor,
             count(*)::bigint as payment_count
        from public.booking_payments bp
       where bp.status = 'paid'
         and bp.paid_at >= v_period.month_start
         and bp.paid_at < (v_period.month_start + interval '1 month')
       group by bp.creator_id, btrim(bp.currency::text)
    ) a
    left join public.creators c on c.id = a.creator_id
    left join public.creator_payouts p
      on p.creator_id = a.creator_id and p.period_start = v_period.month_start
     and p.period_end = v_period.month_end and p.status in ('scheduled', 'paid');
  return jsonb_build_object(
    'month', to_char(v_period.month_start, 'YYYY-MM'),
    'periodStart', v_period.month_start,
    'periodEnd', v_period.month_end,
    'creators', v_creators,
    'totals', jsonb_build_object(
      'grossMinor', v_gross, 'commissionMinor', v_commission,
      'netMinor', v_net, 'paymentCount', v_count));
end $$;
revoke all on function public.kinnso_ops_payout_accrual(date) from public, anon;
grant execute on function public.kinnso_ops_payout_accrual(date) to authenticated;

create or replace function public.kinnso_ops_record_payout(
  p_month date, p_creator_id uuid, p_reference text, p_note text default null) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  v_actor uuid := kinnso_internal.actor();
  v_period record;
  v_currency text;
  v_currencies integer;
  v_gross bigint;
  v_commission bigint;
  v_net bigint;
  v_count bigint;
  v_reference text := nullif(btrim(coalesce(p_reference, '')), '');
  v_note text := nullif(btrim(coalesce(p_note, '')), '');
  v_payout public.creator_payouts;
begin
  if not public.is_active_ops() then raise exception 'forbidden' using errcode = '42501'; end if;
  if p_creator_id is null then raise exception 'invalid_creator'; end if;
  if v_reference is null or char_length(v_reference) < 3 or char_length(v_reference) > 200 then
    raise exception 'invalid_reference';
  end if;
  if v_note is not null and char_length(v_note) > 1000 then raise exception 'invalid_note'; end if;
  select * into v_period from kinnso_internal.creator_payout_month(p_month);
  select min(btrim(bp.currency::text)), count(distinct btrim(bp.currency::text)),
         sum(bp.amount_minor)::bigint, sum(bp.commission_minor)::bigint,
         sum(bp.amount_minor - bp.commission_minor)::bigint, count(*)::bigint
    into v_currency, v_currencies, v_gross, v_commission, v_net, v_count
    from public.booking_payments bp
   where bp.status = 'paid' and bp.creator_id = p_creator_id
     and bp.paid_at >= v_period.month_start
     and bp.paid_at < (v_period.month_start + interval '1 month');
  if coalesce(v_count, 0) = 0 then raise exception 'no_earnings'; end if;
  if v_currencies > 1 then raise exception 'mixed_currency'; end if;
  insert into public.creator_payouts (
    creator_id, period_start, period_end, gross_minor, commission_minor, net_minor,
    currency, status, reference, note, paid_at, created_by)
    values (p_creator_id, v_period.month_start, v_period.month_end, v_gross, v_commission, v_net,
            v_currency, 'paid', v_reference, v_note, now(), v_actor)
    on conflict (creator_id, period_start, period_end) do nothing
    returning * into v_payout;
  if v_payout.id is null then raise exception 'payout_already_recorded'; end if;
  return jsonb_build_object(
    'payoutId', v_payout.id, 'creatorId', v_payout.creator_id,
    'month', to_char(v_period.month_start, 'YYYY-MM'),
    'periodStart', v_period.month_start, 'periodEnd', v_period.month_end,
    'grossMinor', v_payout.gross_minor, 'commissionMinor', v_payout.commission_minor,
    'netMinor', v_payout.net_minor, 'currency', btrim(v_payout.currency::text),
    'reference', v_payout.reference, 'paidAt', v_payout.paid_at);
end $$;
revoke all on function public.kinnso_ops_record_payout(date, uuid, text, text) from public, anon;
grant execute on function public.kinnso_ops_record_payout(date, uuid, text, text) to authenticated;
