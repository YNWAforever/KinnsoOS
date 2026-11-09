-- Booking requests (S6a): request-to-book without money.
--
-- The product does not take payments or confirm bookings. This records a traveller's
-- request against a published guide, lets the owning creator accept or decline it,
-- and lets the traveller withdraw before a decision. No payment fields, no amounts,
-- no contact details are stored or exchanged; the answer is visible in-product.
create table if not exists public.booking_requests (
  id uuid primary key default gen_random_uuid(),
  guide_id uuid not null references public.guides(id) on delete cascade,
  creator_id uuid not null references public.creators(id) on delete cascade,
  traveler_user_id uuid not null references auth.users(id) on delete cascade,
  starts_on date not null,
  ends_on date,
  party_size integer not null check (party_size between 1 and 20),
  message text not null default '' check (char_length(message) <= 1000),
  status text not null default 'requested' check (status in ('requested', 'accepted', 'declined', 'withdrawn')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (ends_on is null or ends_on >= starts_on)
);
create index if not exists booking_requests_traveller_idx on public.booking_requests (traveler_user_id, created_at desc);
create index if not exists booking_requests_creator_idx on public.booking_requests (creator_id, status, created_at desc);
create index if not exists booking_requests_guide_idx on public.booking_requests (guide_id, created_at desc);
alter table public.booking_requests enable row level security;
revoke all on public.booking_requests from public, anon, authenticated;
grant select, insert, update on public.booking_requests to authenticated;

create policy booking_requests_owner_read on public.booking_requests
  for select to authenticated
  using (traveler_user_id = (select auth.uid()) or creator_id = (select auth.uid()));

create function public.kinnso_request_booking(p_guide_id uuid, p_starts_on date, p_ends_on date default null,
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
  return jsonb_build_object('id', v_row.id, 'guideId', v_row.guide_id, 'startsOn', v_row.starts_on,
    'endsOn', v_row.ends_on, 'partySize', v_row.party_size, 'message', v_row.message,
    'status', v_row.status, 'createdAt', v_row.created_at);
end $$;

create function public.kinnso_my_booking_requests() returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare
  v_actor uuid := kinnso_internal.actor();
begin
  if v_actor is null then raise exception 'actor_required' using errcode = '42501'; end if;
  return coalesce((
    select jsonb_agg(jsonb_build_object(
      'id', r.id, 'guideId', r.guide_id, 'guideTitle', g.title, 'creatorName', g.creator_name,
      'startsOn', r.starts_on, 'endsOn', r.ends_on, 'partySize', r.party_size,
      'message', r.message, 'status', r.status, 'createdAt', r.created_at, 'updatedAt', r.updated_at)
      order by r.created_at desc)
    from public.booking_requests r join public.guides g on g.id = r.guide_id
    where r.traveler_user_id = v_actor), '[]'::jsonb);
end $$;

create function public.kinnso_creator_booking_requests(p_limit integer default 50) returns jsonb
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
      'message', r.message, 'status', r.status, 'createdAt', r.created_at)
      order by case r.status when 'requested' then 0 else 1 end, r.created_at desc)
    from (select * from public.booking_requests where creator_id = v_actor order by created_at desc limit v_limit) r
    join public.guides g on g.id = r.guide_id), '[]'::jsonb));
end $$;

create function public.kinnso_respond_booking_request(p_id uuid, p_status text) returns jsonb
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
  return jsonb_build_object('id', v_row.id, 'status', v_row.status, 'updatedAt', v_row.updated_at);
end $$;

create function public.kinnso_withdraw_booking_request(p_id uuid) returns jsonb
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
  return jsonb_build_object('id', v_row.id, 'status', v_row.status, 'updatedAt', v_row.updated_at);
end $$;

revoke all on function public.kinnso_request_booking(uuid, date, date, integer, text) from public, anon;
revoke all on function public.kinnso_my_booking_requests() from public, anon;
revoke all on function public.kinnso_creator_booking_requests(integer) from public, anon;
revoke all on function public.kinnso_respond_booking_request(uuid, text) from public, anon;
revoke all on function public.kinnso_withdraw_booking_request(uuid) from public, anon;
grant execute on function public.kinnso_request_booking(uuid, date, date, integer, text) to authenticated;
grant execute on function public.kinnso_my_booking_requests() to authenticated;
grant execute on function public.kinnso_creator_booking_requests(integer) to authenticated;
grant execute on function public.kinnso_respond_booking_request(uuid, text) to authenticated;
grant execute on function public.kinnso_withdraw_booking_request(uuid) to authenticated;
