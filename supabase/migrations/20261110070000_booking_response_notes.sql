-- Optional creator response note on a booking request decision.
--
-- A creator could only accept or decline; the traveller then saw a bare status
-- with no explanation. This adds a short optional note (max 500 chars) stored on
-- the request and shown to the traveller in their tracker. No contact details are
-- collected or required; the note is free text.
alter table public.booking_requests add column if not exists response_note text;
alter table public.booking_requests drop constraint if exists booking_requests_response_note_check;
alter table public.booking_requests add constraint booking_requests_response_note_check check (response_note is null or char_length(response_note) <= 500);

drop function if exists public.kinnso_respond_booking_request(uuid, text);
create or replace function public.kinnso_respond_booking_request(p_id uuid, p_status text, p_note text default null) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  v_actor uuid := kinnso_internal.actor();
  v_note text := nullif(btrim(coalesce(p_note, '')), '');
  v_row public.booking_requests;
begin
  if v_actor is null then raise exception 'actor_required' using errcode = '42501'; end if;
  if p_status not in ('accepted', 'declined') then raise exception 'invalid_status'; end if;
  if char_length(coalesce(v_note, '')) > 500 then raise exception 'invalid_note'; end if;
  update public.booking_requests
     set status = p_status, response_note = v_note, updated_at = now()
   where id = p_id and creator_id = v_actor and status = 'requested'
   returning * into v_row;
  if not found then raise exception 'request_not_found_or_decided'; end if;
  insert into kinnso_internal.inbox_events (recipient_id, event_type, entity_type, entity_id)
    select v_row.traveler_user_id, 'booking.' || p_status, 'booking_request', v_row.id
    where not exists (select 1 from public.notification_mutes nm
                       where nm.user_id = v_row.traveler_user_id and nm.event_type = 'booking.' || p_status and nm.muted);
  return jsonb_build_object('id', v_row.id, 'status', v_row.status, 'responseNote', v_row.response_note, 'updatedAt', v_row.updated_at);
end $$;

create or replace function public.kinnso_my_booking_requests() returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare
  v_actor uuid := kinnso_internal.actor();
begin
  if v_actor is null then raise exception 'actor_required' using errcode = '42501'; end if;
  return coalesce((
    select jsonb_agg(jsonb_build_object(
      'id', r.id, 'guideId', r.guide_id, 'guideTitle', g.title, 'creatorName', g.creator_name,
      'startsOn', r.starts_on, 'endsOn', r.ends_on, 'partySize', r.party_size,
      'message', r.message, 'status', r.status, 'responseNote', r.response_note,
      'createdAt', r.created_at, 'updatedAt', r.updated_at)
      order by r.created_at desc)
    from public.booking_requests r join public.guides g on g.id = r.guide_id
    where r.traveler_user_id = v_actor), '[]'::jsonb);
end $$;

create or replace function public.kinnso_creator_booking_requests(p_limit integer default 50) returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare
  v_actor uuid := kinnso_internal.actor();
  v_limit integer := least(greatest(coalesce(p_limit, 50), 1), 100);
begin
  if v_actor is null then raise exception 'actor_required' using errcode = '42501'; end if;
  if not exists (select 1 from public.creators c where c.id = v_actor and c.status = 'active') then
    raise exception 'creator_required' using errcode = '42501';
  end if;
  return jsonb_build_object('items', coalesce((
    select jsonb_agg(jsonb_build_object(
      'id', r.id, 'guideId', r.guide_id, 'guideTitle', g.title,
      'startsOn', r.starts_on, 'endsOn', r.ends_on, 'partySize', r.party_size,
      'message', r.message, 'status', r.status, 'responseNote', r.response_note, 'createdAt', r.created_at)
      order by case r.status when 'requested' then 0 else 1 end, r.created_at desc)
    from (select * from public.booking_requests where creator_id = v_actor order by created_at desc limit v_limit) r
    join public.guides g on g.id = r.guide_id), '[]'::jsonb));
end $$;

revoke all on function public.kinnso_respond_booking_request(uuid, text, text) from public, anon;
revoke all on function public.kinnso_my_booking_requests() from public, anon;
revoke all on function public.kinnso_creator_booking_requests(integer) from public, anon;
grant execute on function public.kinnso_respond_booking_request(uuid, text, text) to authenticated;
grant execute on function public.kinnso_my_booking_requests() to authenticated;
grant execute on function public.kinnso_creator_booking_requests(integer) to authenticated;
