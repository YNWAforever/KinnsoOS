-- Private editing drafts may have no days or stops. Publication validation remains unchanged.
-- No tables, grants, ownership, revision, idempotency or existing data are changed.
create or replace function public.save_kinnso_guide_draft(p_draft_id uuid,p_expected_revision integer,p_request_id uuid,p_payload jsonb)
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
 or jsonb_array_length(p_payload->'content'->'days') not between 0 and 30 then raise exception 'invalid_draft'; end if;
 for day in select value from jsonb_array_elements(p_payload->'content'->'days') loop
  perform kinnso_internal.keys(day,array['offset','title','stops']);
  if jsonb_typeof(day->'offset') is distinct from 'number' or (day->>'offset')!~'^[0-9]+$'
  or jsonb_typeof(day->'title') is distinct from 'string' or length(day->>'title')>200
  or jsonb_typeof(day->'stops') is distinct from 'array' or jsonb_array_length(day->'stops') not between 0 and 50 then raise exception 'invalid_draft'; end if;
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

