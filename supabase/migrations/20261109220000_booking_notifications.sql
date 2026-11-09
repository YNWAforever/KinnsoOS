-- Widen the inbox event vocabulary for booking events (additive, keeps existing types).
alter table kinnso_internal.inbox_events drop constraint if exists inbox_events_event_type_check;
alter table kinnso_internal.inbox_events add constraint inbox_events_event_type_check check (
  event_type = any (array['place.report_revision','place.report_resolved','support.updated',
                           'booking.requested','booking.accepted','booking.declined','booking.withdrawn']));
alter table kinnso_internal.inbox_events drop constraint if exists inbox_events_entity_type_check;
alter table kinnso_internal.inbox_events add constraint inbox_events_entity_type_check check (
  entity_type = any (array['place_report','support_case','booking_request','booking_request_creator']));
-- In-app notifications for booking requests.
--
-- The existing inbox (kinnso_internal.inbox_events + public.get_kinnso_inbox)
-- already gives every actor a notification list with unread counts. These
-- create-or-replace functions emit booking events into it in the same
-- transaction as the state change, so no external delivery is needed:
--   creator  <- booking.requested  when a traveller asks for a date
--   creator  <- booking.withdrawn  when a traveller withdraws before a decision
--   traveller <- booking.accepted / booking.declined when the creator decides
create or replace function public.kinnso_request_booking(p_guide_id uuid, p_starts_on date, p_ends_on date default null,
  p_party_size integer default 1, p_message text default '')
returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  v_actor uuid := kinnso_internal.actor();
  v_guide public.guides;
  v_recent integer;
  v_row public.booking_requests;
begin
  if v_actor is null then raise exception 'actor_required' using errcode = '42501'; end if;
  if p_party_size is null or p_party_size < 1 or p_party_size > 20 then raise exception 'invalid_party'; end if;
  if p_starts_on is null or p_starts_on < current_date then raise exception 'invalid_dates'; end if;
  if p_ends_on is not null and p_ends_on < p_starts_on then raise exception 'invalid_dates'; end if;
  if char_length(coalesce(p_message, '')) > 1000 then raise exception 'invalid_message'; end if;

  select * into v_guide from public.guides where id = p_guide_id and status = 'published';
  if not found then raise exception 'guide_not_found'; end if;
  if v_guide.creator_id = v_actor then raise exception 'self_request'; end if;
  if v_guide.synthetic then raise exception 'synthetic_guide'; end if;
  if not exists (select 1 from public.creators c where c.id = v_guide.creator_id and c.status = 'active') then
    raise exception 'creator_unavailable';
  end if;

  select count(*) into v_recent from public.booking_requests
   where traveler_user_id = v_actor and created_at > now() - interval '24 hours';
  if v_recent >= 5 then raise exception 'rate_limited'; end if;

  insert into public.booking_requests (guide_id, creator_id, traveler_user_id, starts_on, ends_on, party_size, message)
    values (p_guide_id, v_guide.creator_id, v_actor, p_starts_on, p_ends_on, p_party_size, btrim(coalesce(p_message, '')))
    returning * into v_row;
  insert into kinnso_internal.inbox_events (recipient_id, event_type, entity_type, entity_id)
    values (v_guide.creator_id, 'booking.requested', 'booking_request_creator', v_row.id);
  return jsonb_build_object('id', v_row.id, 'guideId', v_row.guide_id, 'startsOn', v_row.starts_on,
    'endsOn', v_row.ends_on, 'partySize', v_row.party_size, 'message', v_row.message,
    'status', v_row.status, 'createdAt', v_row.created_at);
end $$;

create or replace function public.kinnso_respond_booking_request(p_id uuid, p_status text) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  v_actor uuid := kinnso_internal.actor();
  v_row public.booking_requests;
begin
  if v_actor is null then raise exception 'actor_required' using errcode = '42501'; end if;
  if p_status not in ('accepted', 'declined') then raise exception 'invalid_status'; end if;
  update public.booking_requests
     set status = p_status, updated_at = now()
   where id = p_id and creator_id = v_actor and status = 'requested'
   returning * into v_row;
  if not found then raise exception 'request_not_found_or_decided'; end if;
  insert into kinnso_internal.inbox_events (recipient_id, event_type, entity_type, entity_id)
    values (v_row.traveler_user_id, 'booking.' || p_status, 'booking_request', v_row.id);
  return jsonb_build_object('id', v_row.id, 'status', v_row.status, 'updatedAt', v_row.updated_at);
end $$;

create or replace function public.kinnso_withdraw_booking_request(p_id uuid) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  v_actor uuid := kinnso_internal.actor();
  v_row public.booking_requests;
begin
  if v_actor is null then raise exception 'actor_required' using errcode = '42501'; end if;
  update public.booking_requests
     set status = 'withdrawn', updated_at = now()
   where id = p_id and traveler_user_id = v_actor and status = 'requested'
   returning * into v_row;
  if not found then raise exception 'request_not_found_or_decided'; end if;
  insert into kinnso_internal.inbox_events (recipient_id, event_type, entity_type, entity_id)
    values (v_row.creator_id, 'booking.withdrawn', 'booking_request_creator', v_row.id);
  return jsonb_build_object('id', v_row.id, 'status', v_row.status, 'updatedAt', v_row.updated_at);
end $$;
