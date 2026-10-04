create or replace function public.adopt_guide_to_trip(p_guide_id uuid,p_version integer,p_trip_id uuid,p_expected_revision integer,p_request_id uuid)
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
 insert into public.trip_revisions(trip_id,revision_no,change_kind,summary) values(t.id,t.head_revision_no+1,'adopt',jsonb_build_object('action','adopt'));
 result:=kinnso_internal.snapshot(t.id);
 insert into kinnso_internal.trip_requests values(actor,p_request_id,t.id,digest,result,now()); return result;
end $$;
create or replace function kinnso_internal.withdraw_source(p_guide_id uuid) returns void language plpgsql security definer set search_path='' as $$
declare t public.trips;
begin
 for t in select * from public.trips where id in(select trip_id from public.trip_stops where source_guide_id=p_guide_id and source_withdrawn_at is null) order by id for update loop
  update public.trip_stops set source_withdrawn_at=now() where trip_id=t.id and source_guide_id=p_guide_id and source_withdrawn_at is null;
  update public.trips set head_revision_no=head_revision_no+1 where id=t.id;
  insert into public.trip_revisions(trip_id,revision_no,change_kind,summary) values(t.id,t.head_revision_no+1,'source_withdrawn',jsonb_build_object('action','source_withdrawn'));
 end loop;
end $$;
