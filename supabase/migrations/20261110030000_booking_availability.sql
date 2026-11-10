-- Creator-published unavailable dates for request-to-book.
--
-- Request-to-book had no way for a creator to say "not these dates", so every
-- request arrived even when the author was away. This adds creator-owned blocked
-- ranges, a public read for the guide page, and makes kinnso_request_booking
-- refuse requests that intersect a blocked range. Nothing here publishes, books
-- or charges: it only narrows which requests are acceptable.
create table if not exists public.guide_unavailable_dates (
  id uuid primary key default gen_random_uuid(),
  guide_id uuid not null references public.guides(id) on delete cascade,
  creator_id uuid not null references public.creators(id) on delete cascade,
  starts_on date not null,
  ends_on date not null,
  created_at timestamptz not null default now(),
  check (ends_on >= starts_on)
);
create index if not exists guide_unavailable_dates_guide_idx on public.guide_unavailable_dates (guide_id, starts_on);
create index if not exists guide_unavailable_dates_creator_idx on public.guide_unavailable_dates (creator_id);
alter table public.guide_unavailable_dates enable row level security;
revoke all on public.guide_unavailable_dates from public, anon, authenticated;

create or replace function public.kinnso_creator_guide_unavailable(p_guide_id uuid) returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare
  v_actor uuid := kinnso_internal.actor();
begin
  if v_actor is null then raise exception 'actor_required' using errcode = '42501'; end if;
  if not exists (select 1 from public.guides g where g.id = p_guide_id and g.creator_id = v_actor) then
    raise exception 'guide_not_found';
  end if;
  return coalesce((
    select jsonb_agg(jsonb_build_object('id', u.id, 'startsOn', u.starts_on, 'endsOn', u.ends_on, 'createdAt', u.created_at)
      order by u.starts_on)
    from public.guide_unavailable_dates u where u.guide_id = p_guide_id), '[]'::jsonb);
end $$;

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
  return jsonb_build_object('id', v_row.id, 'startsOn', v_row.starts_on, 'endsOn', v_row.ends_on, 'createdAt', v_row.created_at);
end $$;

create or replace function public.kinnso_creator_remove_unavailable(p_id uuid) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  v_actor uuid := kinnso_internal.actor();
begin
  if v_actor is null then raise exception 'actor_required' using errcode = '42501'; end if;
  delete from public.guide_unavailable_dates where id = p_id and creator_id = v_actor;
  if not found then raise exception 'range_not_found'; end if;
  return jsonb_build_object('removed', true);
end $$;

create or replace function public.kinnso_guide_unavailable(p_guide_id uuid) returns jsonb
language plpgsql stable security definer set search_path = '' as $$
begin
  if not exists (select 1 from public.guides g where g.id = p_guide_id and g.status = 'published') then
    raise exception 'guide_not_found';
  end if;
  return coalesce((
    select jsonb_agg(jsonb_build_object('startsOn', u.starts_on, 'endsOn', u.ends_on) order by u.starts_on)
    from public.guide_unavailable_dates u where u.guide_id = p_guide_id and u.ends_on >= current_date), '[]'::jsonb);
end $$;

-- Booking requests must not intersect a creator's blocked ranges. This is the
-- same function as 20261109220000 plus the availability check and notification.
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
              where u.guide_id = p_guide_id
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
    values (v_guide.creator_id, 'booking.requested', 'booking_request_creator', v_row.id);
  return jsonb_build_object('id', v_row.id, 'guideId', v_row.guide_id, 'startsOn', v_row.starts_on,
    'endsOn', v_row.ends_on, 'partySize', v_row.party_size, 'message', v_row.message,
    'status', v_row.status, 'createdAt', v_row.created_at);
end $$;

revoke all on function public.kinnso_creator_guide_unavailable(uuid) from public, anon;
revoke all on function public.kinnso_creator_add_unavailable(uuid, date, date) from public, anon;
revoke all on function public.kinnso_creator_remove_unavailable(uuid) from public, anon;
revoke all on function public.kinnso_guide_unavailable(uuid) from public;
grant execute on function public.kinnso_creator_guide_unavailable(uuid) to authenticated;
grant execute on function public.kinnso_creator_add_unavailable(uuid, date, date) to authenticated;
grant execute on function public.kinnso_creator_remove_unavailable(uuid) to authenticated;
grant execute on function public.kinnso_guide_unavailable(uuid) to anon, authenticated;
