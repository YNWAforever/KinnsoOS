-- R10.1: one-time backfill for affiliate conversions that were already paid.
--
-- The trigger in 20260815100100 only sees writes made after it exists. Conversions the
-- nightly cron already landed as 'paid' would otherwise never produce a settlement, and
-- would sit in R10.0's "tracked, not yet payable" section forever despite being payable.
--
-- Same rules and the same conflict target as the trigger, so this is safe to re-run and
-- safe to run in any order relative to the first post-deploy cron cycle.
--
-- Mission-fee settlements are deliberately NOT backfilled. mission_milestone_submissions
-- records reviewed_at and reviewed_by but not the fee in force at approval time, so a
-- backfill would apply today's missions.paid_fee_amount to work approved under a different
-- one. That is a per-mission judgement for an operator, not something a migration guesses.

insert into public.mission_settlements (
  mission_id,
  mission_participant_id,
  affiliate_network_event_id,
  status,
  amount_currency,
  affiliate_commission_amount,
  creator_commission_amount,
  kinnso_commission_amount,
  affiliate_commission_status,
  creator_payout_status,
  kinnso_commission_status
)
select
  ev.mission_id,
  ev.mission_participant_id,
  ev.id,
  'pending',
  upper(coalesce(ev.currency, 'USD')),
  ev.profit_amount,
  round(ev.profit_amount * m.creator_commission_rate / 100.0, 2),
  case when m.kinnso_commission_rate is null or m.kinnso_commission_rate <= 0
       then null else round(ev.profit_amount * m.kinnso_commission_rate / 100.0, 2) end,
  'pending',
  'pending',
  case when m.kinnso_commission_rate is null or m.kinnso_commission_rate <= 0
       then null else 'pending' end
from public.affiliate_network_events ev
join public.missions m on m.id = ev.mission_id
where ev.event_state = 'paid'
  and ev.mission_id is not null
  and ev.mission_participant_id is not null
  and ev.creator_id is not null
  and coalesce(ev.profit_amount, 0) > 0
  and m.creator_commission_rate is not null
  and m.creator_commission_rate > 0
on conflict (affiliate_network_event_id) where affiliate_network_event_id is not null
do nothing;
