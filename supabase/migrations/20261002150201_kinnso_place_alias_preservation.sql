-- Explicit ops review merges duplicate identity without rewriting traveller history.
create table public.kinnso_place_aliases (
 alias_id uuid primary key references public.places(id) on delete restrict,
 canonical_id uuid not null references public.places(id) on delete restrict,
 reviewed_by uuid references auth.users(id) on delete set null,
 reason text not null check(length(btrim(reason)) between 10 and 2000),
 created_at timestamptz not null default now(), check(alias_id<>canonical_id)
);
alter table public.kinnso_place_aliases enable row level security;
revoke all on public.kinnso_place_aliases from public,anon,authenticated;
create table kinnso_internal.place_merge_audit (
 id uuid primary key default gen_random_uuid(),alias_id uuid not null,canonical_id uuid not null,
 actor_id uuid,reason text not null,created_at timestamptz not null default now()
);
alter table kinnso_internal.place_merge_audit enable row level security;
revoke all on kinnso_internal.place_merge_audit from public,anon,authenticated;
create function public.merge_kinnso_place(p_alias_id uuid,p_canonical_id uuid,p_reason text)
returns jsonb language plpgsql security definer set search_path='' as $$
declare actor uuid:=kinnso_internal.actor(); prior uuid;
begin
 if not exists(select 1 from public.kinnso_ops_members where user_id=actor and status='active') then raise exception 'forbidden'; end if;
 if p_alias_id is null or p_canonical_id is null or p_alias_id=p_canonical_id or p_reason is null or length(btrim(p_reason)) not between 10 and 2000 then raise exception 'invalid_merge'; end if;
 perform pg_advisory_xact_lock(hashtextextended('kinnso_place_alias_merge',0));
 perform 1 from public.places where id in(p_alias_id,p_canonical_id) order by id for update;
 select canonical_id into prior from public.kinnso_place_aliases where alias_id=p_alias_id;
 if found then
  if prior<>p_canonical_id then raise exception 'place_merge_conflict'; end if;
  return jsonb_build_object('aliasId',p_alias_id,'canonicalId',prior);
 end if;
 if not exists(select 1 from public.places where id=p_alias_id and status='active') or
    not exists(select 1 from public.places where id=p_canonical_id and status='active') or
    exists(select 1 from public.kinnso_place_aliases where alias_id=p_canonical_id) then raise exception 'invalid_merge'; end if;
 -- Keep aliases flat when a previously canonical place itself is reviewed as duplicate.
 update public.kinnso_place_aliases set canonical_id=p_canonical_id where canonical_id=p_alias_id;
 insert into public.kinnso_place_aliases(alias_id,canonical_id,reviewed_by,reason) values(p_alias_id,p_canonical_id,actor,btrim(p_reason));
 update public.places set status='merged',updated_at=now() where id=p_alias_id;
 insert into kinnso_internal.place_merge_audit(alias_id,canonical_id,actor_id,reason) values(p_alias_id,p_canonical_id,actor,btrim(p_reason));
 return jsonb_build_object('aliasId',p_alias_id,'canonicalId',p_canonical_id);
end $$;
create function public.kinnso_trip_place_facts(p_trip_id uuid) returns jsonb
language plpgsql stable security definer set search_path='' as $$
declare actor uuid:=kinnso_internal.actor(); result jsonb;
begin
 if not exists(select 1 from public.trips where id=p_trip_id and owner_user_id=actor) then raise exception 'trip_not_found'; end if;
 select coalesce(jsonb_agg(jsonb_build_object('placeId',ids.place_id,'canonicalPlaceId',f.place_id,
  'timezone',f.timezone,'openingHours',f.opening_hours,'verifiedAt',f.verified_at,'sourceUrl',f.source_url) order by ids.place_id),'[]'::jsonb)
 into result from(select distinct place_id from public.trip_stops where trip_id=p_trip_id and place_id is not null order by place_id limit 200) ids
 left join public.kinnso_place_aliases a on a.alias_id=ids.place_id
 join public.kinnso_place_facts f on f.place_id=coalesce(a.canonical_id,ids.place_id) and f.published
 join public.places p on p.id=f.place_id and p.status='active';
 return result;
end $$;
revoke all on function public.merge_kinnso_place(uuid,uuid,text),public.kinnso_trip_place_facts(uuid) from public,anon,authenticated;
grant execute on function public.merge_kinnso_place(uuid,uuid,text),public.kinnso_trip_place_facts(uuid) to authenticated;
