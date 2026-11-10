-- B2: upcoming accepted trips for both parties.
--
-- Once a request is accepted the app currently says nothing until the date passes.
-- This RPC returns the actor's accepted trips starting within a few days, for the
-- traveller and (separately) for the creator. It is derived at read time, so it adds
-- no notification rows, no new event types and no mute surface: the product simply
-- surfaces what is already confirmed. No identities beyond the actor's own rows.
create or replace function public.kinnso_upcoming_bookings(p_days integer default 3) returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare
  v_actor uuid := kinnso_internal.actor();
  v_days integer := least(greatest(coalesce(p_days, 3), 0), 14);
  v_traveller jsonb;
  v_creator jsonb;
begin
  if v_actor is null then raise exception 'actor_required' using errcode = '42501'; end if;
  select coalesce(jsonb_agg(jsonb_build_object(
           'id', r.id, 'guideTitle', g.title, 'startsOn', r.starts_on, 'endsOn', r.ends_on,
           'partySize', r.party_size, 'daysUntil', r.starts_on - current_date) order by r.starts_on, r.id), '[]'::jsonb)
    into v_traveller
    from public.booking_requests r
    join public.guides g on g.id = r.guide_id
   where r.traveler_user_id = v_actor and r.status = 'accepted'
     and r.starts_on between current_date and current_date + v_days;
  select coalesce(jsonb_agg(jsonb_build_object(
           'id', r.id, 'guideTitle', g.title, 'startsOn', r.starts_on, 'endsOn', r.ends_on,
           'partySize', r.party_size, 'daysUntil', r.starts_on - current_date) order by r.starts_on, r.id), '[]'::jsonb)
    into v_creator
    from public.booking_requests r
    join public.guides g on g.id = r.guide_id
   where r.creator_id = v_actor and r.status = 'accepted'
     and r.starts_on between current_date and current_date + v_days;
  return jsonb_build_object('days', v_days, 'traveller', v_traveller, 'creator', v_creator);
end $$;

revoke all on function public.kinnso_upcoming_bookings(integer) from public, anon;
grant execute on function public.kinnso_upcoming_bookings(integer) to authenticated;
