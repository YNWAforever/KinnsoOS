-- Creator-wide unavailable dates ("away for all my guides").
--
-- Until now a creator had to block dates guide by guide. This lets one row cover
-- every guide the creator owns. A null guide_id means "all my guides"; the public
-- guide read and the request-to-book check both include those rows. Existing
-- guide-specific rows keep working unchanged.
alter table public.guide_unavailable_dates alter column guide_id drop not null;
comment on column public.guide_unavailable_dates.guide_id is 'NULL = blocked for every guide owned by creator_id';

create or replace function public.kinnso_creator_guide_unavailable(p_guide_id uuid) returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare
  v_actor uuid := kinnso_internal.actor();
  v_creator uuid;
begin
  if v_actor is null then raise exception 'actor_required' using errcode = '42501'; end if;
  select g.creator_id into v_creator from public.guides g where g.id = p_guide_id and g.creator_id = v_actor;
  if v_creator is null then raise exception 'guide_not_found'; end if;
  return coalesce((
    select jsonb_agg(jsonb_build_object('id', u.id, 'guideId', u.guide_id, 'startsOn', u.starts_on, 'endsOn', u.ends_on, 'createdAt', u.created_at)
      order by u.starts_on, u.created_at)
    from public.guide_unavailable_dates u
    where (u.guide_id = p_guide_id or (u.guide_id is null and u.creator_id = v_creator))), '[]'::jsonb);
end $$;

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
       and coalesce(r.ends_on, r.starts_on) >= p_starts_on;
  return jsonb_build_object('id', v_row.id, 'guideId', v_row.guide_id, 'startsOn', v_row.starts_on, 'endsOn', v_row.ends_on, 'createdAt', v_row.created_at);
end $$;

create or replace function public.kinnso_guide_unavailable(p_guide_id uuid) returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare
  v_creator uuid;
begin
  select g.creator_id into v_creator from public.guides g where g.id = p_guide_id and g.status = 'published';
  if v_creator is null then raise exception 'guide_not_found'; end if;
  return coalesce((
    select jsonb_agg(jsonb_build_object('startsOn', u.starts_on, 'endsOn', u.ends_on) order by u.starts_on)
    from public.guide_unavailable_dates u
    where u.ends_on >= current_date
      and (u.guide_id = p_guide_id or (u.guide_id is null and u.creator_id = v_creator))), '[]'::jsonb);
end $$;

-- Request-to-book also honours creator-wide blocks.
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
    values (v_guide.creator_id, 'booking.requested', 'booking_request_creator', v_row.id);
  return jsonb_build_object('id', v_row.id, 'guideId', v_row.guide_id, 'startsOn', v_row.starts_on,
    'endsOn', v_row.ends_on, 'partySize', v_row.party_size, 'message', v_row.message,
    'status', v_row.status, 'createdAt', v_row.created_at);
end $$;

revoke all on function public.kinnso_creator_guide_unavailable(uuid) from public, anon;
revoke all on function public.kinnso_creator_add_unavailable(uuid, date, date) from public, anon;
revoke all on function public.kinnso_guide_unavailable(uuid) from public;
grant execute on function public.kinnso_creator_guide_unavailable(uuid) to authenticated;
grant execute on function public.kinnso_creator_add_unavailable(uuid, date, date) to authenticated;
grant execute on function public.kinnso_guide_unavailable(uuid) to anon, authenticated;
