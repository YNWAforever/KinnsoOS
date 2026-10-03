-- R10.0: one owner-gated read model for everything a creator has actually earned.
--
-- /studio/earnings reads only public.mission_settlements (lib/missions/queries.ts:113-120),
-- and nothing in this repository inserts a row into that table — so the page is empty by
-- construction. Two other money streams do produce rows and neither is reachable:
--
--   * booking_settlements carries a 10% creator leg written by
--     create_booking_settlement_on_confirm() (20260704140000), but 20260704141000 revoked
--     ALL privileges on that table from anon and authenticated and never granted them back.
--     A definer function is the only way a creator can ever see it.
--   * affiliate_network_events carries attributed conversions from the daily Travelpayouts
--     cron, with creator_id populated from affiliate_partner_links.
--
-- This function is read-only. It creates no table, no policy and no write path; minting
-- settlement rows is R10.1.
--
-- Honesty boundary (R7.3): affiliate events are reported in their own array as tracked
-- volume and are deliberately NOT summed into any payable total by the caller. An event
-- that already has a settlement row is omitted here entirely, so once R10.1 mints from it
-- the money is counted once, as a settlement, and never twice.

create or replace function public.creator_earnings_summary()
returns jsonb language plpgsql stable security definer set search_path = public as $$
declare
  v_uid uuid := auth.uid();
begin
  if not exists (select 1 from public.creators where id = v_uid and status = 'active') then
    raise exception 'forbidden' using errcode = '42501';
  end if;

  return jsonb_build_object(
    -- Mission settlements. mission_settlements has no creator_id column; attribution is
    -- through mission_participants, which is also what mission_settlements_visible_select
    -- uses. The inner join is deliberate: a settlement with no participant is not
    -- attributable to any creator and must not appear on someone's earnings page.
    'mission_settlements', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id',             s.id,
        'mission_title',  m.title,
        'mission_type',   m.mission_type,
        'mission_source', m.mission_source,
        'currency',       upper(coalesce(s.amount_currency, 'USD')),
        'amount',         coalesce(s.creator_commission_amount, 0) + coalesce(s.paid_fee_amount, 0),
        'payout_status',  coalesce(s.creator_payout_status, 'pending')
      ) order by s.updated_at desc)
      from public.mission_settlements s
      join public.mission_participants p on p.id = s.mission_participant_id
      join public.missions m on m.id = s.mission_id
      where p.creator_id = v_uid
    ), '[]'::jsonb),

    -- Booking commission. bookings.creator_id is the attribution the Stripe path already
    -- enforces (validate_booking_insert, 20260805120300). creator_commission_amount is NULL
    -- when a booking had no attributed creator, so filter on it rather than reporting zeros.
    'booking_settlements', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id',                bs.id,
        'experience_title',  e.title,
        'currency',          upper(bs.currency),
        'amount',            bs.creator_commission_amount,
        'payout_status',     coalesce(bs.creator_commission_status, 'pending')
      ) order by bs.updated_at desc)
      from public.booking_settlements bs
      join public.bookings b on b.id = bs.booking_id
      join public.experiences e on e.id = b.experience_id
      where b.creator_id = v_uid
        and bs.creator_commission_amount is not null
    ), '[]'::jsonb),

    -- Tracked affiliate volume: recorded, not yet payable. 'cancelled' and 'unknown' are
    -- excluded — showing them would imply money that will never arrive. Events that already
    -- produced a settlement are excluded so nothing is counted twice.
    'tracked_affiliate', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id',            ev.id,
        'mission_title', m.title,
        'currency',      upper(coalesce(ev.currency, 'USD')),
        'gross_amount',  coalesce(ev.profit_amount, 0),
        'event_state',   ev.event_state
      ) order by ev.external_updated_at desc nulls last)
      from public.affiliate_network_events ev
      left join public.missions m on m.id = ev.mission_id
      where ev.creator_id = v_uid
        and ev.event_state in ('processing','paid')
        and not exists (
          select 1 from public.mission_settlements s2
          where s2.affiliate_network_event_id = ev.id
        )
    ), '[]'::jsonb)
  );
end $$;

-- Supabase's default privileges re-grant EXECUTE to anon, authenticated and service_role on
-- every new public function (see 20260627155000), so each client role is named explicitly.
-- service_role keeps its default grant, matching creator_insights: the function is harmless
-- server-side (auth.uid() is null there, so the gate simply raises).
revoke all on function public.creator_earnings_summary() from public, anon, authenticated;
grant execute on function public.creator_earnings_summary() to authenticated;
