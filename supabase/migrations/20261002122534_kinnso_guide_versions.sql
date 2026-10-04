create table kinnso_internal.requests (
 actor_id uuid not null references auth.users(id) on delete cascade,
 request_id uuid not null, digest text not null, result jsonb not null,
 created_at timestamptz not null default now(), primary key(actor_id,request_id)
);
alter table kinnso_internal.requests enable row level security;
revoke all on kinnso_internal.requests from public,anon,authenticated;

create table public.destination_aliases (
 alias text primary key check(alias=lower(btrim(alias)) and length(alias) between 1 and 80),
 destination_id uuid not null references public.destinations(id) on delete cascade
);
alter table public.destination_aliases enable row level security;
revoke all on public.destination_aliases from public,anon,authenticated;
grant select on public.destination_aliases to anon,authenticated;
create policy destination_aliases_public on public.destination_aliases for select to anon,authenticated
using(exists(select 1 from public.destinations d where d.id=destination_id and d.status='published'));
-- Bind known names to existing curated rows only. No invented destination IDs.
insert into public.destination_aliases(alias,destination_id)
select a.alias,d.id from public.destinations d cross join lateral unnest(case
 when d.slug='kyoto' then array['kyoto','京都']
 when d.slug in ('hong-kong','hongkong') then array['hong kong','香港'] else array[lower(d.name)] end) a(alias)
on conflict do nothing;
create function public.resolve_kinnso_destination(p_query text) returns jsonb language sql stable security definer set search_path='' as $$
 select jsonb_build_object('id',d.id,'displayName',d.name) from public.destinations d
 where d.status='published' and (lower(btrim(p_query))=lower(d.name) or lower(btrim(p_query))=d.slug
 or exists(select 1 from public.destination_aliases a where a.destination_id=d.id and a.alias=lower(btrim(p_query)))
 or exists(select 1 from unnest(d.match_terms) t where lower(t)=lower(btrim(p_query))))
 order by d.sort_order,d.id limit 1;
$$;
revoke all on function public.resolve_kinnso_destination(text) from public;
grant execute on function public.resolve_kinnso_destination(text) to anon,authenticated;

create table public.guide_versions (
 guide_id uuid not null references public.guides(id) on delete cascade,
 version integer not null check(version>0), content jsonb not null,
 published_at timestamptz not null default now(), withdrawn_at timestamptz,
 primary key(guide_id,version)
);
alter table public.guide_versions enable row level security;
revoke all on public.guide_versions from public,anon,authenticated;
grant select on public.guide_versions to anon,authenticated;
create policy guide_versions_public on public.guide_versions for select to anon,authenticated
using(withdrawn_at is null and exists(select 1 from public.guides g where g.id=guide_id and g.status='published'));
alter table public.trip_stops add column source_guide_version integer check(source_guide_version>0);
create index guide_versions_active_idx on public.guide_versions(guide_id,version desc) where withdrawn_at is null;

create function kinnso_internal.guide_content(p_content jsonb) returns jsonb language plpgsql set search_path='' as $$
declare d jsonb; s jsonb; v_days jsonb:='[]'; v_stops jsonb; v_offsets integer[]:='{}'; n integer:=0; off integer;
begin
 perform kinnso_internal.keys(p_content,array['days']);
 if octet_length(p_content::text)>262144 or jsonb_typeof(p_content->'days') is distinct from 'array'
 or jsonb_array_length(p_content->'days') not between 1 and 30 then raise exception 'invalid_guide'; end if;
 for d in select value from jsonb_array_elements(p_content->'days') loop
  perform kinnso_internal.keys(d,array['offset','title','stops']);
  if jsonb_typeof(d->'offset') is distinct from 'number' or (d->>'offset')!~'^[0-9]+$'
  or jsonb_typeof(d->'title') is distinct from 'string' or length(d->>'title')>200
  or jsonb_typeof(d->'stops') is distinct from 'array' or jsonb_array_length(d->'stops') not between 1 and 50
  then raise exception 'invalid_guide'; end if;
  off:=(d->>'offset')::integer;
  if off>364 or off=any(v_offsets) then raise exception 'invalid_guide'; end if;
  v_offsets:=array_append(v_offsets,off); v_stops:='[]';
  for s in select value from jsonb_array_elements(d->'stops') loop
   perform kinnso_internal.keys(s,array['title','description','placeId','startMinuteOfDay','durationMinutes']);
   if jsonb_typeof(s->'title') is distinct from 'string' or length(btrim(s->>'title')) not between 1 and 200
   or jsonb_typeof(s->'description') is distinct from 'string' or length(s->>'description')>4000
   then raise exception 'invalid_guide'; end if;
   perform kinnso_internal.stop_input(s-'description');
   if (s->>'startMinuteOfDay')::integer not between 0 and 1439 or (s->>'durationMinutes')::integer not between 1 and 1440
   then raise exception 'invalid_guide'; end if;
   if s->>'placeId' is not null and not exists(select 1 from public.places where id=(s->>'placeId')::uuid) then raise exception 'invalid_place'; end if;
   n:=n+1; if n>200 then raise exception 'invalid_guide'; end if;
   v_stops:=v_stops||jsonb_build_array(s||jsonb_build_object('id',gen_random_uuid(),'position',jsonb_array_length(v_stops),'source',null));
  end loop;
  v_days:=v_days||jsonb_build_array(jsonb_build_object('id',gen_random_uuid(),'offset',off,'title',d->>'title','stops',v_stops));
 end loop;
 return jsonb_build_object('days',v_days);
end $$;

create function public.kinnso_guide(p_guide_id uuid) returns jsonb language plpgsql stable security definer set search_path='' as $$
declare g public.guides; v public.guide_versions; destination jsonb;
begin
 select * into g from public.guides where id=p_guide_id and status='published';
 if not found then raise exception 'guide_not_found'; end if;
 destination:=public.resolve_kinnso_destination(g.city);
 select * into v from public.guide_versions where guide_id=g.id and withdrawn_at is null order by version desc limit 1;
 if not found then return jsonb_build_object('kind','summary','id',g.id,'title',g.title,'summary',g.summary,'destinationId',destination->'id'); end if;
 return jsonb_build_object('kind','itinerary','id',g.id,'title',g.title,'version',v.version,'publishedAt',v.published_at,
 'destinationId',destination->'id','creator',jsonb_build_object('id',g.creator_id,'name',g.creator_name,'handle',g.creator_handle),'days',v.content->'days');
end $$;

create function public.publish_guide_version(p_guide_id uuid,p_expected_version integer,p_request_id uuid,p_content jsonb)
returns jsonb language plpgsql security definer set search_path='' as $$
declare actor uuid:=kinnso_internal.actor(); g public.guides; ver integer; prior kinnso_internal.requests;
 digest text; result jsonb; content jsonb;
begin
 if not exists(select 1 from public.creators where id=actor and status='active') then raise exception 'creator_required'; end if;
 if p_request_id is null or p_expected_version is null or p_expected_version<0 then raise exception 'invalid_guide'; end if;
 perform pg_advisory_xact_lock(hashtextextended(actor::text||p_request_id::text,0));
 select * into g from public.guides where id=p_guide_id and creator_id=actor for update;
 if not found then raise exception 'guide_not_found'; end if;
 digest:=kinnso_internal.request_digest(jsonb_build_object('publish',g.id,'expected',p_expected_version,'content',p_content)::text);
 select * into prior from kinnso_internal.requests where actor_id=actor and request_id=p_request_id;
 if found then if prior.digest<>digest then raise exception 'idempotency_conflict'; end if; return prior.result; end if;
 select coalesce(max(version),0) into ver from public.guide_versions where guide_id=g.id;
 if ver<>p_expected_version then raise exception 'revision_conflict'; end if;
 content:=kinnso_internal.guide_content(p_content);
 insert into public.guide_versions(guide_id,version,content) values(g.id,ver+1,content);
 update public.guides set status='published',published_at=coalesce(published_at,now()) where id=g.id;
 result:=public.kinnso_guide(g.id);
 insert into kinnso_internal.requests(actor_id,request_id,digest,result) values(actor,p_request_id,digest,result);
 return result;
end $$;

create function public.adopt_guide_to_trip(p_guide_id uuid,p_version integer,p_trip_id uuid,p_expected_revision integer,p_request_id uuid)
returns jsonb language plpgsql security definer set search_path='' as $$
declare actor uuid:=kinnso_internal.actor(); t public.trips; g public.guides; v public.guide_versions;
 prior kinnso_internal.trip_requests; digest text; result jsonb; d jsonb; s jsonb; day_id uuid; base integer; n integer;
begin
 if p_request_id is null then raise exception 'invalid_command'; end if;
 perform pg_advisory_xact_lock(hashtextextended(actor::text||p_request_id::text,0));
 select * into t from public.trips where id=p_trip_id and owner_user_id=actor for update;
 if not found then raise exception 'trip_not_found'; end if;
 digest:=kinnso_internal.request_digest(jsonb_build_object('adopt',p_guide_id,'version',p_version,'trip',t.id,'expected',p_expected_revision)::text);
 select * into prior from kinnso_internal.trip_requests where actor_id=actor and request_id=p_request_id;
 if found then if prior.digest<>digest then raise exception 'idempotency_conflict'; end if; return prior.result; end if;
 if t.head_revision_no<>p_expected_revision then raise exception 'trip_revision_conflict'; end if;
 select * into g from public.guides where id=p_guide_id and status='published' for share;
 if not found then raise exception 'source_unavailable'; end if;
 select * into v from public.guide_versions where guide_id=g.id and version=p_version and withdrawn_at is null for share;
 if not found then raise exception 'source_unavailable'; end if;
 select coalesce(max(day_offset)+1,0) into base from public.trip_days where trip_id=t.id;
 for d in select value from jsonb_array_elements(v.content->'days') loop
  day_id:=gen_random_uuid();
  insert into public.trip_days(id,trip_id,day_offset,title) values(day_id,t.id,base+(d->>'offset')::integer,nullif(d->>'title',''));
  n:=0;
  for s in select value from jsonb_array_elements(d->'stops') loop
   insert into public.trip_stops(trip_id,trip_day_id,position,title,place_id,start_minute_of_day,duration_minutes,origin,
   source_guide_id,source_guide_version,source_guide_slug,source_creator_id,source_creator_name,source_creator_handle,copied_title,copied_note,adopted_at)
   values(t.id,day_id,n,s->>'title',(s->>'placeId')::uuid,(s->>'startMinuteOfDay')::integer,(s->>'durationMinutes')::integer,'adopted',
   g.id,v.version,g.slug,g.creator_id,g.creator_name,g.creator_handle,s->>'title',s->>'description',now());n:=n+1;
  end loop;
 end loop;
 update public.trips set head_revision_no=head_revision_no+1 where id=t.id;
 insert into public.trip_revisions(trip_id,revision_no,change_kind,summary) values(t.id,t.head_revision_no+1,'adopt','Adopted server-published version');
 result:=kinnso_internal.snapshot(t.id);
 insert into kinnso_internal.trip_requests values(actor,p_request_id,t.id,digest,result,now()); return result;
end $$;

create function kinnso_internal.withdraw_source(p_guide_id uuid) returns void language plpgsql security definer set search_path='' as $$
declare t public.trips;
begin
 for t in select * from public.trips where id in(select trip_id from public.trip_stops where source_guide_id=p_guide_id and source_withdrawn_at is null) order by id for update loop
  update public.trip_stops set source_withdrawn_at=now() where trip_id=t.id and source_guide_id=p_guide_id and source_withdrawn_at is null;
  update public.trips set head_revision_no=head_revision_no+1 where id=t.id;
  insert into public.trip_revisions(trip_id,revision_no,change_kind,summary) values(t.id,t.head_revision_no+1,'source_withdrawn','Source withdrawn; private notes retained');
 end loop;
end $$;
create function public.withdraw_guide_versions(p_guide_id uuid) returns jsonb language plpgsql security definer set search_path='' as $$
declare actor uuid:=kinnso_internal.actor();
begin
 perform 1 from public.guides where id=p_guide_id and creator_id=actor for update;
 if not found then raise exception 'guide_not_found'; end if;
 update public.guide_versions set withdrawn_at=coalesce(withdrawn_at,now()) where guide_id=p_guide_id;
 perform kinnso_internal.withdraw_source(p_guide_id); return jsonb_build_object('withdrawn',true);
end $$;
create function kinnso_internal.source_removed() returns trigger language plpgsql security definer set search_path='' as $$
begin
 if tg_op='DELETE' or (old.status='published' and new.status<>'published') then perform kinnso_internal.withdraw_source(old.id); end if;
 return old;
end $$;
-- AFTER avoids replacing the existing guide row in an UPDATE trigger.
create trigger kinnso_source_removed after delete or update of status on public.guides for each row execute function kinnso_internal.source_removed();

create function public.kinnso_bookmark(p_guide_id uuid,p_desired_state boolean,p_request_id uuid) returns jsonb
language plpgsql security definer set search_path='' as $$
declare actor uuid:=kinnso_internal.actor(); prior kinnso_internal.requests; digest text; result jsonb;
begin
 if p_request_id is null or p_desired_state is null then raise exception 'invalid_command'; end if;
 perform pg_advisory_xact_lock(hashtextextended(actor::text||p_request_id::text,0));
 digest:=kinnso_internal.request_digest(jsonb_build_object('bookmark',p_guide_id,'state',p_desired_state)::text);
 select * into prior from kinnso_internal.requests where actor_id=actor and request_id=p_request_id;
 if found then if prior.digest<>digest then raise exception 'idempotency_conflict'; end if; return prior.result; end if;
 if p_desired_state then
  if not exists(select 1 from public.guides where id=p_guide_id and status='published') then raise exception 'guide_not_found'; end if;
  insert into public.guide_saves(guide_id,traveler_user_id) values(p_guide_id,actor) on conflict(guide_id,traveler_user_id) do nothing;
 else delete from public.guide_saves where guide_id=p_guide_id and traveler_user_id=actor; end if;
 result:=jsonb_build_object('saved',p_desired_state);
 insert into kinnso_internal.requests(actor_id,request_id,digest,result) values(actor,p_request_id,digest,result); return result;
end $$;
revoke all on function kinnso_internal.guide_content(jsonb),kinnso_internal.withdraw_source(uuid),kinnso_internal.source_removed() from public,anon,authenticated;
revoke all on function public.kinnso_guide(uuid),public.publish_guide_version(uuid,integer,uuid,jsonb),public.adopt_guide_to_trip(uuid,integer,uuid,integer,uuid),public.withdraw_guide_versions(uuid),public.kinnso_bookmark(uuid,boolean,uuid) from public,anon;
grant execute on function public.kinnso_guide(uuid) to anon,authenticated;
grant execute on function public.publish_guide_version(uuid,integer,uuid,jsonb),public.adopt_guide_to_trip(uuid,integer,uuid,integer,uuid),public.withdraw_guide_versions(uuid),public.kinnso_bookmark(uuid,boolean,uuid) to authenticated;
create or replace function kinnso_internal.snapshot(p_id uuid) returns jsonb language sql stable set search_path = '' as $$
  select jsonb_build_object('id',t.id,'title',t.title,'destinationId',t.destination_id,
    'timezone',t.timezone,'startDate',t.start_date,'status',t.status,'revision',t.head_revision_no,
    'days',coalesce((select jsonb_agg(jsonb_build_object('id',d.id,'offset',d.day_offset,
      'title',coalesce(d.title,''),'stops',coalesce((select jsonb_agg(jsonb_build_object(
        'id',s.id,'placeId',s.place_id,'title',s.title,'position',s.position,
        'travellerNote',coalesce(s.traveller_note,''),'startMinuteOfDay',s.start_minute_of_day,
        'durationMinutes',s.duration_minutes,'source',case when s.origin = 'adopted' then
          jsonb_build_object('guideId',s.source_guide_id,'guideVersion',s.source_guide_version,'creatorId',s.source_creator_id,
            'creatorName',coalesce(s.source_creator_name,'Creator'),'canonicalUrl',null,
            'withdrawn',s.source_withdrawn_at is not null) else null end
      ) order by s.position) from public.trip_stops s where s.trip_day_id = d.id),'[]'::jsonb))
      order by d.day_offset) from public.trip_days d where d.trip_id = t.id),'[]'::jsonb),
    'media',coalesce((select jsonb_agg(jsonb_build_object('id',m.id,'ownerId',m.owner_id,
      'visibility','private','state',m.state) order by m.created_at,m.id)
      from public.kinnso_trip_media m where m.trip_id = t.id and m.attached),'[]'::jsonb))
  from public.trips t where t.id = p_id;
$$;
