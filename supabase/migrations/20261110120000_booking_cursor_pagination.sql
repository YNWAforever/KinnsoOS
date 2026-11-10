-- Keyset (cursor) pagination for booking request history.
--
-- Offset pagination can skip or repeat rows when a request is created while a
-- traveller or creator is paging. Both read RPCs now accept a keyset cursor
-- instead: the creator list keeps the pending-first order and takes the cursor
-- as (pendingFirst, createdAt, id); the traveller list orders by (createdAt, id).
-- Earlier overloads (no-arg / offset) would make PostgREST resolution ambiguous; only the cursor signatures remain.
drop function if exists public.kinnso_creator_booking_requests(integer);
drop function if exists public.kinnso_creator_booking_requests(integer, integer);
drop function if exists public.kinnso_my_booking_requests();
drop function if exists public.kinnso_my_booking_requests(integer, integer);

create or replace function public.kinnso_creator_booking_requests(
  p_limit integer default 50,
  p_cursor_pending integer default null,
  p_cursor_created_at timestamptz default null,
  p_cursor_id uuid default null)
returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare
  v_actor uuid := kinnso_internal.actor();
  v_limit integer := least(greatest(coalesce(p_limit, 50), 1), 100);
  v_items jsonb;
  v_has_more boolean;
begin
  if v_actor is null then raise exception 'actor_required' using errcode = '42501'; end if;
  if not exists (select 1 from public.creators c where c.id = v_actor and c.status = 'active') then
    raise exception 'creator_required' using errcode = '42501';
  end if;
  if (p_cursor_created_at is null) <> (p_cursor_id is null) then raise exception 'invalid_cursor'; end if;
  select coalesce(jsonb_agg(jsonb_build_object(
      'id', p.id, 'guideId', p.guide_id, 'guideTitle', p.guide_title,
      'startsOn', p.starts_on, 'endsOn', p.ends_on, 'partySize', p.party_size,
      'message', p.message, 'status', p.status, 'responseNote', p.response_note, 'createdAt', p.created_at)
      order by p.pending_first, p.created_at desc, p.id), '[]'::jsonb)
    into v_items
  from (
    select r.id, r.guide_id, g.title as guide_title, r.starts_on, r.ends_on, r.party_size,
           r.message, r.status, r.response_note, r.created_at,
           case when r.status = 'requested' then 0 else 1 end as pending_first
      from public.booking_requests r
      join public.guides g on g.id = r.guide_id
     where r.creator_id = v_actor
       and (p_cursor_created_at is null
            or (case when r.status = 'requested' then 0 else 1 end) > coalesce(p_cursor_pending, 0)
            or ((case when r.status = 'requested' then 0 else 1 end) = coalesce(p_cursor_pending, 0)
                and (r.created_at < p_cursor_created_at
                     or (r.created_at = p_cursor_created_at and r.id < p_cursor_id))))
     order by case when r.status = 'requested' then 0 else 1 end, r.created_at desc, r.id
     limit v_limit + 1
  ) p;
  v_has_more := coalesce(jsonb_array_length(v_items), 0) > v_limit;
  if v_has_more then
    select coalesce(jsonb_agg(item order by ord), '[]'::jsonb) into v_items
    from jsonb_array_elements(v_items) with ordinality as t(item, ord)
    where ord <= v_limit;
  end if;
  return jsonb_build_object('items', v_items, 'hasMore', v_has_more);
end $$;

create or replace function public.kinnso_my_booking_requests(
  p_limit integer default 50,
  p_cursor_created_at timestamptz default null,
  p_cursor_id uuid default null)
returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare
  v_actor uuid := kinnso_internal.actor();
  v_limit integer := least(greatest(coalesce(p_limit, 50), 1), 100);
  v_items jsonb;
  v_has_more boolean;
begin
  if v_actor is null then raise exception 'actor_required' using errcode = '42501'; end if;
  if (p_cursor_created_at is null) <> (p_cursor_id is null) then raise exception 'invalid_cursor'; end if;
  select coalesce(jsonb_agg(jsonb_build_object(
      'id', r.id, 'guideId', r.guide_id, 'guideTitle', g.title, 'creatorName', g.creator_name,
      'startsOn', r.starts_on, 'endsOn', r.ends_on, 'partySize', r.party_size,
      'message', r.message, 'status', r.status, 'responseNote', r.response_note,
      'createdAt', r.created_at, 'updatedAt', r.updated_at)
      order by r.created_at desc, r.id), '[]'::jsonb)
    into v_items
    from (
      select * from public.booking_requests
       where traveler_user_id = v_actor
         and (p_cursor_created_at is null
              or created_at < p_cursor_created_at
              or (created_at = p_cursor_created_at and id < p_cursor_id))
       order by created_at desc, id
       limit v_limit + 1
    ) r
    join public.guides g on g.id = r.guide_id;
  v_has_more := coalesce(jsonb_array_length(v_items), 0) > v_limit;
  if v_has_more then
    select coalesce(jsonb_agg(item order by ord), '[]'::jsonb) into v_items
    from jsonb_array_elements(v_items) with ordinality as t(item, ord)
    where ord <= v_limit;
  end if;
  return jsonb_build_object('items', v_items, 'hasMore', v_has_more);
end $$;

revoke all on function public.kinnso_creator_booking_requests(integer, integer, timestamptz, uuid) from public, anon;
revoke all on function public.kinnso_my_booking_requests(integer, timestamptz, uuid) from public, anon;
grant execute on function public.kinnso_creator_booking_requests(integer, integer, timestamptz, uuid) to authenticated;
grant execute on function public.kinnso_my_booking_requests(integer, timestamptz, uuid) to authenticated;
