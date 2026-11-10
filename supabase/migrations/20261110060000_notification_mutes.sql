-- Per-event in-app notification mutes.
--
-- The inbox only has an email opt-out; a traveller who does not want booking
-- notices had no way to stop them without also losing everything. Mutes are
-- per recipient and per booking event type, applied at event insertion so the
-- unread count never grows for muted notices. The email preference table is
-- unchanged.
create table if not exists public.notification_mutes (
  user_id uuid not null references auth.users(id) on delete cascade,
  event_type text not null check (event_type in ('booking.requested','booking.withdrawn','booking.accepted','booking.declined','booking.dates_blocked')),
  muted boolean not null default true,
  updated_at timestamptz not null default now(),
  primary key (user_id, event_type)
);
alter table public.notification_mutes enable row level security;
revoke all on public.notification_mutes from public, anon, authenticated;

create or replace function public.kinnso_get_notification_mutes() returns jsonb
language sql stable security definer set search_path = '' as $$
  select coalesce(jsonb_agg(jsonb_build_object(
      'eventType', t.event_type,
      'muted', coalesce(m.muted, false)) order by t.position), '[]'::jsonb)
  from (values
    ('booking.requested', 1), ('booking.withdrawn', 2), ('booking.accepted', 3),
    ('booking.declined', 4), ('booking.dates_blocked', 5)) as t(event_type, position)
  left join public.notification_mutes m
    on m.user_id = kinnso_internal.actor() and m.event_type = t.event_type
  where kinnso_internal.actor() is not null;
$$;

create or replace function public.kinnso_set_notification_mute(p_event_type text, p_muted boolean) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  v_actor uuid := kinnso_internal.actor();
begin
  if v_actor is null then raise exception 'actor_required' using errcode = '42501'; end if;
  if p_event_type is null or p_event_type not in ('booking.requested','booking.withdrawn','booking.accepted','booking.declined','booking.dates_blocked') then
    raise exception 'invalid_event_type';
  end if;
  if p_muted is null then raise exception 'invalid_preference'; end if;
  insert into public.notification_mutes (user_id, event_type, muted)
    values (v_actor, p_event_type, p_muted)
    on conflict (user_id, event_type) do update set muted = excluded.muted, updated_at = now();
  return jsonb_build_object('eventType', p_event_type, 'muted', p_muted);
end $$;

-- Booking request: creator's "new request" notice respects the creator's mute.
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
  if exists (select 1 from public.guide_unavailable_dates u
              where (u.guide_id = p_guide_id or (u.guide_id is null and u.creator_id = v_guide.creator_id))
                and u.starts_on <= coalesce(p_ends_on, p_starts_on)
                and u.ends_on >= p_starts_on) then
    raise exception 'dates_unavailable';
  end if;

  select count(*) into v_recent from public.booking_requests
   where traveler_user_id = v_actor and created_at > now() - interval '24 hours';
  if v_recent >= 5 then raise exception 'rate_limited'; end if;

  insert into public.booking_requests (guide_id, creator_id, traveler_user_id, starts_on, ends_on, party_size, message)
    values (p_guide_id, v_guide.creator_id, v_actor, p_starts_on, p_ends_on, p_party_size, btrim(coalesce(p_message, '')))
    returning * into v_row;
  insert into kinnso_internal.inbox_events (recipient_id, event_type, entity_type, entity_id)
    select v_guide.creator_id, 'booking.requested', 'booking_request_creator', v_row.id
    where not exists (select 1 from public.notification_mutes nm
                       where nm.user_id = v_guide.creator_id and nm.event_type = 'booking.requested' and nm.muted);
  return jsonb_build_object('id', v_row.id, 'guideId', v_row.guide_id, 'startsOn', v_row.starts_on,
    'endsOn', v_row.ends_on, 'partySize', v_row.party_size, 'message', v_row.message,
    'status', v_row.status, 'createdAt', v_row.created_at);
end $$;

-- Creator response: traveller's accepted/declined notice respects the traveller's mute.
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
    select v_row.traveler_user_id, 'booking.' || p_status, 'booking_request', v_row.id
    where not exists (select 1 from public.notification_mutes nm
                       where nm.user_id = v_row.traveler_user_id and nm.event_type = 'booking.' || p_status and nm.muted);
  return jsonb_build_object('id', v_row.id, 'status', v_row.status, 'updatedAt', v_row.updated_at);
end $$;

-- Withdrawal: creator's notice respects the creator's mute.
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
    select v_row.creator_id, 'booking.withdrawn', 'booking_request_creator', v_row.id
    where not exists (select 1 from public.notification_mutes nm
                       where nm.user_id = v_row.creator_id and nm.event_type = 'booking.withdrawn' and nm.muted);
  return jsonb_build_object('id', v_row.id, 'status', v_row.status, 'updatedAt', v_row.updated_at);
end $$;

-- Blocked dates: traveller's notice respects the traveller's mute.
create or replace function public.kinnso_creator_add_unavailable(p_guide_id uuid, p_starts_on date, p_ends_on date) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  v_actor uuid := kinnso_internal.actor();
  v_creator uuid;
  v_row public.guide_unavailable_dates;
begin
  if v_actor is null then raise exception 'actor_required' using errcode = '42501'; end if;
  if not exists (select 1 from public.creators c where c.id = v_actor and c.status = 'active') then
    raise exception 'creator_required' using errcode = '42501';
  end if;
  if p_guide_id is null then
    v_creator := v_actor;
  else
    select g.creator_id into v_creator from public.guides g where g.id = p_guide_id and g.creator_id = v_actor;
    if v_creator is null then raise exception 'guide_not_found'; end if;
  end if;
  if p_starts_on is null or p_ends_on is null or p_ends_on < p_starts_on then raise exception 'invalid_dates'; end if;
  if p_starts_on < current_date then raise exception 'invalid_dates'; end if;
  if p_starts_on > current_date + interval '365 days' then raise exception 'invalid_dates'; end if;
  if p_ends_on - p_starts_on > 60 then raise exception 'range_too_long'; end if;
  if (select count(*) from public.guide_unavailable_dates u where u.creator_id = v_actor and u.ends_on >= current_date) >= 40 then
    raise exception 'too_many_ranges';
  end if;
  if exists (select 1 from public.guide_unavailable_dates u
              where u.creator_id = v_actor
                and u.guide_id is not distinct from p_guide_id
                and u.starts_on <= p_ends_on and u.ends_on >= p_starts_on) then
    raise exception 'range_overlap';
  end if;
  insert into public.guide_unavailable_dates (guide_id, creator_id, starts_on, ends_on)
    values (p_guide_id, v_actor, p_starts_on, p_ends_on) returning * into v_row;
  insert into kinnso_internal.inbox_events (recipient_id, event_type, entity_type, entity_id)
    select distinct r.traveler_user_id, 'booking.dates_blocked', 'booking_request', r.id
      from public.booking_requests r
      join public.guides g on g.id = r.guide_id
     where r.status = 'requested'
       and g.creator_id = v_actor
       and (p_guide_id is null or r.guide_id = p_guide_id)
       and r.starts_on <= p_ends_on
       and coalesce(r.ends_on, r.starts_on) >= p_starts_on
       and not exists (select 1 from public.notification_mutes nm
                        where nm.user_id = r.traveler_user_id and nm.event_type = 'booking.dates_blocked' and nm.muted);
  return jsonb_build_object('id', v_row.id, 'guideId', v_row.guide_id, 'startsOn', v_row.starts_on, 'endsOn', v_row.ends_on, 'createdAt', v_row.created_at);
end $$;

revoke all on function public.kinnso_get_notification_mutes() from public, anon;
revoke all on function public.kinnso_set_notification_mute(text, boolean) from public, anon;
revoke all on function public.kinnso_request_booking(uuid, date, date, integer, text) from public, anon;
revoke all on function public.kinnso_respond_booking_request(uuid, text) from public, anon;
revoke all on function public.kinnso_withdraw_booking_request(uuid) from public, anon;
revoke all on function public.kinnso_creator_add_unavailable(uuid, date, date) from public, anon;
grant execute on function public.kinnso_get_notification_mutes() to authenticated;
grant execute on function public.kinnso_set_notification_mute(text, boolean) to authenticated;
grant execute on function public.kinnso_request_booking(uuid, date, date, integer, text) to authenticated;
grant execute on function public.kinnso_respond_booking_request(uuid, text) to authenticated;
grant execute on function public.kinnso_withdraw_booking_request(uuid) to authenticated;
grant execute on function public.kinnso_creator_add_unavailable(uuid, date, date) to authenticated;
