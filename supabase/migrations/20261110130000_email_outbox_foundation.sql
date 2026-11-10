-- E1: email outbox foundation (flag off by default; nothing sends yet).
--
-- The email design (docs/implementation/EMAIL_DELIVERY_DESIGN_2026-11-10.md) starts
-- with the queue and the notifier wiring, both inert until an operator enables the
-- flag. This migration adds:
--   * kinnso_internal.runtime_flags + email_outbox_enabled() (default false),
--   * public.email_outbox (service-role only, idempotent per recipient/event/entity),
--   * kinnso_internal.enqueue_booking_email(), which no-ops while the flag is off
--     and honours the in-app mute as the email preference until a separate channel
--     preference exists,
--   * the four booking notifiers writing an outbox row beside the inbox event,
--   * an ops-only flag toggle so staging can be enabled without a deploy.
-- No provider, address or network call is involved.
create table if not exists kinnso_internal.runtime_flags (
  flag text primary key,
  enabled boolean not null default false,
  updated_at timestamptz not null default now()
);
insert into kinnso_internal.runtime_flags (flag, enabled) values ('email_outbox', false)
  on conflict (flag) do nothing;
revoke all on kinnso_internal.runtime_flags from public, anon, authenticated;

create or replace function kinnso_internal.email_outbox_enabled() returns boolean
language sql stable security definer set search_path = '' as $$
  select coalesce((select enabled from kinnso_internal.runtime_flags where flag = 'email_outbox'), false);
$$;
revoke all on function kinnso_internal.email_outbox_enabled() from public, anon, authenticated;

create table if not exists public.email_outbox (
  id uuid primary key default gen_random_uuid(),
  recipient_user_id uuid not null references auth.users(id) on delete cascade,
  event_type text not null check (event_type in ('booking.requested','booking.withdrawn','booking.accepted','booking.declined','booking.dates_blocked')),
  entity_type text not null default 'booking_request',
  entity_id uuid not null,
  payload jsonb not null default '{}'::jsonb,
  status text not null default 'pending' check (status in ('pending','sending','sent','failed')),
  attempts integer not null default 0,
  next_attempt_at timestamptz not null default now(),
  last_error text,
  provider_message_id text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
alter table public.email_outbox enable row level security;
revoke all on public.email_outbox from public, anon, authenticated;
create unique index if not exists email_outbox_idempotency on public.email_outbox (recipient_user_id, event_type, entity_id);
create index if not exists email_outbox_due on public.email_outbox (next_attempt_at) where status = 'pending';

create or replace function kinnso_internal.enqueue_booking_email(
  p_recipient uuid, p_event_type text, p_entity_type text, p_entity_id uuid, p_payload jsonb)
returns void
language plpgsql security definer set search_path = '' as $$
begin
  if p_recipient is null or p_entity_id is null then return; end if;
  if not kinnso_internal.email_outbox_enabled() then return; end if;
  if exists (select 1 from public.notification_mutes nm
              where nm.user_id = p_recipient and nm.event_type = p_event_type and nm.muted) then
    return;
  end if;
  insert into public.email_outbox (recipient_user_id, event_type, entity_type, entity_id, payload)
    values (p_recipient, p_event_type, coalesce(p_entity_type, 'booking_request'), p_entity_id, coalesce(p_payload, '{}'::jsonb))
    on conflict (recipient_user_id, event_type, entity_id) do nothing;
end $$;
revoke all on function kinnso_internal.enqueue_booking_email(uuid, text, text, uuid, jsonb) from public, anon, authenticated;

create or replace function public.kinnso_ops_set_email_outbox(p_enabled boolean) returns jsonb
language plpgsql security definer set search_path = '' as $$
begin
  if not public.is_active_ops() then raise exception 'forbidden' using errcode = '42501'; end if;
  if p_enabled is null then raise exception 'invalid_preference'; end if;
  insert into kinnso_internal.runtime_flags (flag, enabled) values ('email_outbox', p_enabled)
    on conflict (flag) do update set enabled = excluded.enabled, updated_at = now();
  return jsonb_build_object('flag', 'email_outbox', 'enabled', p_enabled);
end $$;
revoke all on function public.kinnso_ops_set_email_outbox(boolean) from public, anon;
grant execute on function public.kinnso_ops_set_email_outbox(boolean) to authenticated;

create or replace function public.kinnso_ops_email_outbox_status() returns jsonb
language plpgsql stable security definer set search_path = '' as $$
begin
  if not public.is_active_ops() then raise exception 'forbidden' using errcode = '42501'; end if;
  return jsonb_build_object(
    'enabled', coalesce((select enabled from kinnso_internal.runtime_flags where flag = 'email_outbox'), false),
    'pending', (select count(*) from public.email_outbox where status = 'pending'),
    'failed', (select count(*) from public.email_outbox where status = 'failed'),
    'oldestPendingAt', (select min(created_at) from public.email_outbox where status = 'pending'));
end $$;
revoke all on function public.kinnso_ops_email_outbox_status() from public, anon;
grant execute on function public.kinnso_ops_email_outbox_status() to authenticated;

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
    select v_guide.creator_id, 'booking.requested', 'booking_request', v_row.id
    where not exists (select 1 from public.notification_mutes nm
                       where nm.user_id = v_guide.creator_id and nm.event_type = 'booking.requested' and nm.muted);
  perform kinnso_internal.enqueue_booking_email(v_guide.creator_id, 'booking.requested', 'booking_request', v_row.id,
    jsonb_build_object('guideTitle', v_guide.title, 'startsOn', v_row.starts_on, 'endsOn', v_row.ends_on, 'partySize', v_row.party_size, 'status', v_row.status));
  return jsonb_build_object('id', v_row.id, 'guideId', v_row.guide_id, 'startsOn', v_row.starts_on,
    'endsOn', v_row.ends_on, 'partySize', v_row.party_size, 'message', v_row.message,
    'status', v_row.status, 'createdAt', v_row.created_at);
end $$;

create or replace function public.kinnso_respond_booking_request(p_id uuid, p_status text, p_note text default null) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  v_actor uuid := kinnso_internal.actor();
  v_note text := nullif(btrim(coalesce(p_note, '')), '');
  v_row public.booking_requests;
  v_title text;
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
  select g.title into v_title from public.guides g where g.id = v_row.guide_id;
  perform kinnso_internal.enqueue_booking_email(v_row.traveler_user_id, 'booking.' || p_status, 'booking_request', v_row.id,
    jsonb_build_object('guideTitle', v_title, 'startsOn', v_row.starts_on, 'endsOn', v_row.ends_on, 'partySize', v_row.party_size, 'status', v_row.status));
  return jsonb_build_object('id', v_row.id, 'status', v_row.status, 'responseNote', v_row.response_note, 'updatedAt', v_row.updated_at);
end $$;

create or replace function public.kinnso_withdraw_booking_request(p_id uuid) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  v_actor uuid := kinnso_internal.actor();
  v_row public.booking_requests;
  v_title text;
begin
  if v_actor is null then raise exception 'actor_required' using errcode = '42501'; end if;
  update public.booking_requests
     set status = 'withdrawn', updated_at = now()
   where id = p_id and traveler_user_id = v_actor and status = 'requested'
   returning * into v_row;
  if not found then raise exception 'request_not_found_or_decided'; end if;
  insert into kinnso_internal.inbox_events (recipient_id, event_type, entity_type, entity_id)
    select v_row.creator_id, 'booking.withdrawn', 'booking_request', v_row.id
    where not exists (select 1 from public.notification_mutes nm
                       where nm.user_id = v_row.creator_id and nm.event_type = 'booking.withdrawn' and nm.muted);
  select g.title into v_title from public.guides g where g.id = v_row.guide_id;
  perform kinnso_internal.enqueue_booking_email(v_row.creator_id, 'booking.withdrawn', 'booking_request', v_row.id,
    jsonb_build_object('guideTitle', v_title, 'startsOn', v_row.starts_on, 'endsOn', v_row.ends_on, 'partySize', v_row.party_size, 'status', v_row.status));
  return jsonb_build_object('id', v_row.id, 'status', v_row.status, 'updatedAt', v_row.updated_at);
end $$;

create or replace function public.kinnso_creator_add_unavailable(p_guide_id uuid, p_starts_on date, p_ends_on date) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  v_actor uuid := kinnso_internal.actor();
  v_creator uuid;
  v_row public.guide_unavailable_dates;
  v_notice record;
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
  for v_notice in
    select r.id, r.traveler_user_id, r.starts_on, r.ends_on, r.party_size, g.title
      from public.booking_requests r
      join public.guides g on g.id = r.guide_id
     where r.status = 'requested'
       and g.creator_id = v_actor
       and (p_guide_id is null or r.guide_id = p_guide_id)
       and r.starts_on <= p_ends_on
       and coalesce(r.ends_on, r.starts_on) >= p_starts_on
  loop
    perform kinnso_internal.enqueue_booking_email(v_notice.traveler_user_id, 'booking.dates_blocked', 'booking_request', v_notice.id,
      jsonb_build_object('guideTitle', v_notice.title, 'startsOn', v_notice.starts_on, 'endsOn', v_notice.ends_on, 'partySize', v_notice.party_size,
                         'blockedStartsOn', p_starts_on, 'blockedEndsOn', p_ends_on));
  end loop;
  return jsonb_build_object('id', v_row.id, 'guideId', v_row.guide_id, 'startsOn', v_row.starts_on, 'endsOn', v_row.ends_on, 'createdAt', v_row.created_at);
end $$;

revoke all on function public.kinnso_request_booking(uuid, date, date, integer, text) from public, anon;
revoke all on function public.kinnso_respond_booking_request(uuid, text, text) from public, anon;
revoke all on function public.kinnso_withdraw_booking_request(uuid) from public, anon;
revoke all on function public.kinnso_creator_add_unavailable(uuid, date, date) from public, anon;
grant execute on function public.kinnso_request_booking(uuid, date, date, integer, text) to authenticated;
grant execute on function public.kinnso_respond_booking_request(uuid, text, text) to authenticated;
grant execute on function public.kinnso_withdraw_booking_request(uuid) to authenticated;
grant execute on function public.kinnso_creator_add_unavailable(uuid, date, date) to authenticated;
