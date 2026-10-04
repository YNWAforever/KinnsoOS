-- Creator commands reuse the existing publication, source-withdrawal and profile
-- projection services. Private drafts and receipts never have direct API grants.
create table kinnso_internal.guide_drafts (
 guide_id uuid primary key references public.guides(id) on delete cascade,
 revision integer not null check(revision > 0), payload jsonb not null,
 base_version integer not null check(base_version >= 0),
 updated_at timestamptz not null default now()
);
create table kinnso_internal.creator_requests (
 actor_id uuid not null references auth.users(id) on delete cascade,
 request_id uuid not null, digest text not null, result jsonb not null,
 created_at timestamptz not null default now(), primary key(actor_id,request_id)
);
alter table kinnso_internal.guide_drafts enable row level security;
alter table kinnso_internal.creator_requests enable row level security;
revoke all on kinnso_internal.guide_drafts,kinnso_internal.creator_requests from public,anon,authenticated,service_role;

create function kinnso_internal.creator_draft_snapshot(p_id uuid) returns jsonb
language sql stable set search_path='' as $$
 select jsonb_build_object('id',g.id,'revision',coalesce(d.revision,0),
 'publishedVersion',coalesce((select max(version) from public.guide_versions where guide_id=g.id),0),
 'sourceChanged',d.guide_id is not null and d.base_version<>coalesce((select max(version) from public.guide_versions where guide_id=g.id),0),
 'title',g.title,'city',g.city,'summary',g.summary,'status',g.status,
 'payload',coalesce(d.payload,jsonb_build_object('title',g.title,'city',g.city,'summary',g.summary,'content',
  (select jsonb_build_object('days',(select jsonb_agg(jsonb_build_object('offset',day->'offset','title',day->'title','stops',
   (select jsonb_agg(jsonb_build_object('title',stop->'title','description',stop->'description','placeId',stop->'placeId',
    'startMinuteOfDay',stop->'startMinuteOfDay','durationMinutes',stop->'durationMinutes') order by stop_index)
    from jsonb_array_elements(day->'stops') with ordinality as s(stop,stop_index))) order by day_index)
   from jsonb_array_elements(v.content->'days') with ordinality as a(day,day_index)))
   from public.guide_versions v where guide_id=g.id order by version desc limit 1))))
 from public.guides g left join kinnso_internal.guide_drafts d on d.guide_id=g.id where g.id=p_id;
$$;
create function public.get_kinnso_guide_draft(p_draft_id uuid) returns jsonb
language plpgsql stable security definer set search_path='' as $$
declare actor uuid:=kinnso_internal.actor();
begin
 if not exists(select 1 from public.guides where id=p_draft_id and creator_id=actor) then raise exception 'guide_not_found'; end if;
 return kinnso_internal.creator_draft_snapshot(p_draft_id);
end $$;
create function public.list_kinnso_guide_drafts(p_after uuid default null) returns jsonb
language plpgsql stable security definer set search_path='' as $$
declare actor uuid:=kinnso_internal.actor(); items jsonb;
begin
 select coalesce(jsonb_agg(kinnso_internal.creator_draft_snapshot(g.id) order by g.id),'[]') into items
 from (select id from public.guides where creator_id=actor and (p_after is null or id>p_after) order by id limit 21) g;
 return jsonb_build_object('items',case when jsonb_array_length(items)>20 then items-20 else items end,
 'nextCursor',case when jsonb_array_length(items)>20 then items->19->'id' else null end);
end $$;

create function public.save_kinnso_guide_draft(p_draft_id uuid,p_expected_revision integer,p_request_id uuid,p_payload jsonb)
returns jsonb language plpgsql security definer set search_path='' as $$
declare actor uuid:=kinnso_internal.actor(); c public.creators; g public.guides; d kinnso_internal.guide_drafts;
 prior kinnso_internal.creator_requests; digest text; result jsonb; day jsonb; stop jsonb; offsets integer[]:='{}'; off integer; count_stops integer:=0;
begin
 select * into c from public.creators where id=actor and status='active';
 if not found then raise exception 'creator_required'; end if;
 if p_request_id is null or p_draft_id is null or p_expected_revision is null or p_expected_revision<0 then raise exception 'invalid_draft'; end if;
 perform kinnso_internal.keys(p_payload,array['title','city','summary','content']);
 if octet_length(p_payload::text)>262144 or jsonb_typeof(p_payload->'title') is distinct from 'string'
 or length(p_payload->>'title')>200 or jsonb_typeof(p_payload->'city') is distinct from 'string' or length(p_payload->>'city')>120
 or jsonb_typeof(p_payload->'summary') is distinct from 'string' or length(p_payload->>'summary')>4000
 or jsonb_typeof(p_payload->'content') is distinct from 'object' then raise exception 'invalid_draft'; end if;
 -- Drafts may be incomplete. Bound and validate their shape without inventing
 -- missing stop titles; the mature publisher requires complete authored stops.
 perform kinnso_internal.keys(p_payload->'content',array['days']);
 if jsonb_typeof(p_payload->'content'->'days') is distinct from 'array'
 or jsonb_array_length(p_payload->'content'->'days') not between 1 and 30 then raise exception 'invalid_draft'; end if;
 for day in select value from jsonb_array_elements(p_payload->'content'->'days') loop
  perform kinnso_internal.keys(day,array['offset','title','stops']);
  if jsonb_typeof(day->'offset') is distinct from 'number' or (day->>'offset')!~'^[0-9]+$'
  or jsonb_typeof(day->'title') is distinct from 'string' or length(day->>'title')>200
  or jsonb_typeof(day->'stops') is distinct from 'array' or jsonb_array_length(day->'stops') not between 1 and 50 then raise exception 'invalid_draft'; end if;
  off:=(day->>'offset')::integer;
  if off>364 or off=any(offsets) then raise exception 'invalid_draft'; end if;
  offsets:=array_append(offsets,off);
  for stop in select value from jsonb_array_elements(day->'stops') loop
   perform kinnso_internal.keys(stop,array['title','description','placeId','startMinuteOfDay','durationMinutes']);
   if jsonb_typeof(stop->'title') is distinct from 'string' or length(stop->>'title')>200
   or jsonb_typeof(stop->'description') is distinct from 'string' or length(stop->>'description')>4000 then raise exception 'invalid_draft'; end if;
   -- Reuse the mature typed stop validator, substituting only a transient title
   -- for shape validation. The original empty title is stored unchanged.
   perform kinnso_internal.stop_input((stop-'description')||jsonb_build_object('title',case when length(btrim(stop->>'title'))=0 then 'Draft' else stop->>'title' end));
   count_stops:=count_stops+1; if count_stops>200 then raise exception 'invalid_draft'; end if;
  end loop;
 end loop;
 perform pg_advisory_xact_lock(hashtextextended(actor::text||p_request_id::text,0));
 digest:=kinnso_internal.request_digest(jsonb_build_object('action','saveDraft','id',p_draft_id,'expected',p_expected_revision,'payload',p_payload)::text);
 select * into prior from kinnso_internal.creator_requests where actor_id=actor and request_id=p_request_id;
 if found then if prior.digest<>digest then raise exception 'idempotency_conflict'; end if; return prior.result; end if;
 -- Also serialize creation at the aggregate ID, including distinct request IDs.
 perform pg_advisory_xact_lock(hashtextextended('guide-draft:'||p_draft_id::text,0));
 select * into g from public.guides where id=p_draft_id for update;
 if found and g.creator_id<>actor then raise exception 'guide_not_found'; end if;
 select * into d from kinnso_internal.guide_drafts where guide_id=p_draft_id;
 if coalesce(d.revision,0)<>p_expected_revision then raise exception 'revision_conflict'; end if;
 if g.id is null then
  insert into public.guides(id,creator_id,creator_name,creator_handle,slug,title,city,summary,cover_url,status)
  values(p_draft_id,actor,coalesce(c.display_name,'Creator'),coalesce(c.handle,''),'guide-'||p_draft_id,p_payload->>'title',p_payload->>'city',p_payload->>'summary','','draft');
 end if;
 insert into kinnso_internal.guide_drafts(guide_id,revision,payload,base_version)
 values(p_draft_id,1,p_payload,coalesce((select max(version) from public.guide_versions where guide_id=p_draft_id),0))
 on conflict(guide_id) do update set revision=guide_drafts.revision+1,payload=excluded.payload,base_version=excluded.base_version,updated_at=now();
 -- Published metadata remains tied to the published version until confirmation.
 if g.id is null or g.status='draft' then
  update public.guides set title=p_payload->>'title',city=p_payload->>'city',summary=p_payload->>'summary' where id=p_draft_id;
 end if;
 result:=kinnso_internal.creator_draft_snapshot(p_draft_id);
 insert into kinnso_internal.creator_requests values(actor,p_request_id,digest,result,now()); return result;
end $$;

create function public.publish_kinnso_guide_draft(p_draft_id uuid,p_expected_revision integer,p_request_id uuid)
returns jsonb language plpgsql security definer set search_path='' as $$
declare actor uuid:=kinnso_internal.actor(); d kinnso_internal.guide_drafts; prior kinnso_internal.creator_requests;
 digest text; snapshot jsonb; result jsonb; ver integer;
begin
 if not exists(select 1 from public.creators where id=actor and status='active') then raise exception 'creator_required'; end if;
 if p_request_id is null or p_expected_revision is null or p_expected_revision<1 then raise exception 'invalid_draft'; end if;
 perform pg_advisory_xact_lock(hashtextextended(actor::text||p_request_id::text,0));
 digest:=kinnso_internal.request_digest(jsonb_build_object('action','publishDraft','id',p_draft_id,'expected',p_expected_revision)::text);
 select * into prior from kinnso_internal.creator_requests where actor_id=actor and request_id=p_request_id;
 if found then if prior.digest<>digest then raise exception 'idempotency_conflict'; end if; return prior.result; end if;
 perform 1 from public.guides where id=p_draft_id and creator_id=actor for update;
 if not found then raise exception 'guide_not_found'; end if;
 select * into d from kinnso_internal.guide_drafts where guide_id=p_draft_id for update;
 if not found then raise exception 'guide_not_found'; end if;
 if d.revision<>p_expected_revision then raise exception 'revision_conflict'; end if;
 if length(btrim(d.payload->>'title'))<1 or length(btrim(d.payload->>'city'))<1 or length(btrim(d.payload->>'summary'))<1 then raise exception 'invalid_draft'; end if;
 select coalesce(max(version),0) into ver from public.guide_versions where guide_id=p_draft_id;
 if d.base_version<>ver then raise exception 'revision_conflict'; end if;
 update public.guides set title=d.payload->>'title',city=d.payload->>'city',summary=d.payload->>'summary' where id=p_draft_id;
 snapshot:=public.publish_guide_version(p_draft_id,ver,gen_random_uuid(),d.payload->'content');
 update kinnso_internal.guide_drafts set revision=revision+1,base_version=ver+1,updated_at=now() where guide_id=p_draft_id;
 result:=jsonb_build_object('draft',kinnso_internal.creator_draft_snapshot(p_draft_id),'snapshot',snapshot);
 insert into kinnso_internal.creator_requests values(actor,p_request_id,digest,result,now()); return result;
end $$;

create function public.confirm_kinnso_creator_profile(p_request_id uuid,p_profile jsonb,p_confirmed boolean)
returns jsonb language plpgsql security definer set search_path='' as $$
declare actor uuid:=kinnso_internal.actor(); c public.creators; prior kinnso_internal.creator_requests;
 digest text; result jsonb; final jsonb; key text; item jsonb;
begin
 if p_request_id is null or p_confirmed is distinct from true then raise exception 'invalid_confirmation'; end if;
 perform pg_advisory_xact_lock(hashtextextended(actor::text||p_request_id::text,0));
 select * into c from public.creators where id=actor for update;
 if not found or c.status not in ('onboarding','active') then raise exception 'forbidden'; end if;
 perform kinnso_internal.keys(p_profile,array['bio','niches','content_pillars','tone','languages']);
 if octet_length(p_profile::text)>16384 or jsonb_typeof(p_profile->'bio') is distinct from 'string' or length(p_profile->>'bio')>4000 then raise exception 'invalid_profile'; end if;
 foreach key in array array['niches','content_pillars','tone','languages'] loop
  if jsonb_typeof(p_profile->key) is distinct from 'array' or jsonb_array_length(p_profile->key)>20 then raise exception 'invalid_profile'; end if;
  for item in select value from jsonb_array_elements(p_profile->key) loop
   if jsonb_typeof(item) is distinct from 'string' or length(item#>>'{}') not between 1 and 120 then raise exception 'invalid_profile'; end if;
  end loop;
 end loop;
 digest:=kinnso_internal.request_digest(jsonb_build_object('action','confirmProfile','profile',p_profile)::text);
 select * into prior from kinnso_internal.creator_requests where actor_id=actor and request_id=p_request_id;
 if found then if prior.digest<>digest then raise exception 'idempotency_conflict'; end if; return prior.result; end if;
 -- Manual input never creates AI trust signals, follower counts or verification.
 final:=p_profile||jsonb_build_object('audience','{}'::jsonb,'platforms','[]'::jsonb);
 insert into public.creator_dna(creator_id,final,status) values(actor,final,'published')
 on conflict(creator_id) do update set final=excluded.final,status='published';
 update public.creators set status='active' where id=actor and status='onboarding';
 result:=jsonb_build_object('status','active');
 insert into kinnso_internal.creator_requests values(actor,p_request_id,digest,result,now()); return result;
end $$;
revoke all on function kinnso_internal.creator_draft_snapshot(uuid) from public,anon,authenticated,service_role;
revoke all on function public.get_kinnso_guide_draft(uuid),public.list_kinnso_guide_drafts(uuid),
 public.save_kinnso_guide_draft(uuid,integer,uuid,jsonb),public.publish_kinnso_guide_draft(uuid,integer,uuid),
 public.confirm_kinnso_creator_profile(uuid,jsonb,boolean) from public,anon,authenticated,service_role;
grant execute on function public.get_kinnso_guide_draft(uuid),public.list_kinnso_guide_drafts(uuid),
 public.save_kinnso_guide_draft(uuid,integer,uuid,jsonb),public.publish_kinnso_guide_draft(uuid,integer,uuid),
 public.confirm_kinnso_creator_profile(uuid,jsonb,boolean) to authenticated;
