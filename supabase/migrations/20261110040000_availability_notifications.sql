-- Notify travellers whose pending request now overlaps a newly blocked range.
--
-- A creator can block dates after a request was already sent; previously the
-- traveller learned nothing and could wait on a date that can no longer happen.
-- Adding a blocked range now notifies those travellers in-app (no auto-decline:
-- the request keeps its status until someone decides or withdraws).
alter table kinnso_internal.inbox_events drop constraint if exists inbox_events_event_type_check;
alter table kinnso_internal.inbox_events add constraint inbox_events_event_type_check check (
  event_type = any (array['place.report_revision','place.report_resolved','support.updated',
                           'booking.requested','booking.accepted','booking.declined','booking.withdrawn',
                           'booking.dates_blocked']));

create or replace function public.kinnso_creator_add_unavailable(p_guide_id uuid, p_starts_on date, p_ends_on date) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  v_actor uuid := kinnso_internal.actor();
  v_row public.guide_unavailable_dates;
begin
  if v_actor is null then raise exception 'actor_required' using errcode = '42501'; end if;
  if not exists (select 1 from public.creators c where c.id = v_actor and c.status = 'active') then
    raise exception 'creator_required' using errcode = '42501';
  end if;
  if not exists (select 1 from public.guides g where g.id = p_guide_id and g.creator_id = v_actor) then
    raise exception 'guide_not_found';
  end if;
  if p_starts_on is null or p_ends_on is null or p_ends_on < p_starts_on then raise exception 'invalid_dates'; end if;
  if p_starts_on < current_date then raise exception 'invalid_dates'; end if;
  if p_starts_on > current_date + interval '365 days' then raise exception 'invalid_dates'; end if;
  if p_ends_on - p_starts_on > 60 then raise exception 'range_too_long'; end if;
  if (select count(*) from public.guide_unavailable_dates u where u.guide_id = p_guide_id and u.ends_on >= current_date) >= 40 then
    raise exception 'too_many_ranges';
  end if;
  if exists (select 1 from public.guide_unavailable_dates u
              where u.guide_id = p_guide_id and u.starts_on <= p_ends_on and u.ends_on >= p_starts_on) then
    raise exception 'range_overlap';
  end if;
  insert into public.guide_unavailable_dates (guide_id, creator_id, starts_on, ends_on)
    values (p_guide_id, v_actor, p_starts_on, p_ends_on) returning * into v_row;
  insert into kinnso_internal.inbox_events (recipient_id, event_type, entity_type, entity_id)
    select distinct r.traveler_user_id, 'booking.dates_blocked', 'booking_request', r.id
      from public.booking_requests r
     where r.guide_id = p_guide_id
       and r.status = 'requested'
       and r.starts_on <= p_ends_on
       and coalesce(r.ends_on, r.starts_on) >= p_starts_on;
  return jsonb_build_object('id', v_row.id, 'startsOn', v_row.starts_on, 'endsOn', v_row.ends_on, 'createdAt', v_row.created_at);
end $$;

revoke all on function public.kinnso_creator_add_unavailable(uuid, date, date) from public, anon;
grant execute on function public.kinnso_creator_add_unavailable(uuid, date, date) to authenticated;
