-- Unapplied. Stable block markers travel with editor moves; original domain bytes stay unchanged.
create table kinnso_internal.discovery_guide_markers (
 guide_id uuid primary key references public.guides(id) on delete cascade, draft_revision integer not null, slots jsonb not null
);
alter table kinnso_internal.discovery_guide_markers enable row level security;
revoke all on kinnso_internal.discovery_guide_markers from public,anon,authenticated,service_role;
create function kinnso_internal.discovery_strip_markers(p_payload jsonb) returns jsonb language plpgsql immutable set search_path='' as $$
declare d jsonb; s jsonb; days jsonb:='[]'; stops jsonb;
begin
 if jsonb_typeof(p_payload->'content'->'days') is distinct from 'array' then return p_payload;end if;
 for d in select value from jsonb_array_elements(p_payload->'content'->'days') loop
  stops:='[]';for s in select value from jsonb_array_elements(d->'stops') loop stops:=stops||jsonb_build_array(s-'studioBlockId');end loop;
  days:=days||jsonb_build_array(jsonb_set(d,'{stops}',stops));
 end loop;
 return jsonb_set(p_payload,'{content,days}',days);
end $$;
create function kinnso_internal.discovery_record_markers(p_guide uuid,p_revision integer,p_payload jsonb) returns void language plpgsql set search_path='' as $$
declare slots jsonb;
begin
 -- A replay of an older write must not replace the head editor's marker map.
 if not exists(select 1 from kinnso_internal.guide_drafts where guide_id=p_guide and revision=p_revision) then return;end if;
 select coalesce(jsonb_agg(jsonb_build_object('day',d.ordinality-1,'stop',s.ordinality-1,'blockId',s.value->'studioBlockId')),'[]') into slots
 from jsonb_array_elements(p_payload->'content'->'days') with ordinality d cross join lateral jsonb_array_elements(d.value->'stops') with ordinality s
 where s.value ? 'studioBlockId';
 insert into kinnso_internal.discovery_guide_markers values(p_guide,p_revision,slots) on conflict(guide_id) do update set draft_revision=excluded.draft_revision,slots=excluded.slots;
end $$;
create function kinnso_internal.discovery_restore_markers(p_guide uuid,p_payload jsonb) returns jsonb language plpgsql stable set search_path='' as $$
declare slot jsonb; result jsonb:=p_payload;
begin
 for slot in select value from kinnso_internal.discovery_guide_markers m cross join lateral jsonb_array_elements(m.slots)
 join kinnso_internal.guide_drafts d on d.guide_id=m.guide_id and d.revision=m.draft_revision where m.guide_id=p_guide loop
  result:=jsonb_set(result,array['content','days',slot->>'day','stops',slot->>'stop','studioBlockId'],slot->'blockId');
 end loop;
 return result;
end $$;
create function kinnso_internal.discovery_assert_markers(p_payload jsonb,p_artifact uuid,p_revision integer,p_selected jsonb) returns void language plpgsql set search_path='' as $$
declare body jsonb; block jsonb; ids jsonb; marker jsonb;
begin
 select v.body into body from public.studio_artifact_versions v where artifact_id=p_artifact and revision=p_revision;
 select coalesce(jsonb_agg(s.value->'studioBlockId'),'[]') into ids from jsonb_array_elements(p_payload->'content'->'days') d
 cross join lateral jsonb_array_elements(d->'stops') s where s.value ? 'studioBlockId';
 if (select count(distinct value) from jsonb_array_elements(ids))<>jsonb_array_length(ids) then raise exception 'invalid_lineage_change';end if;
 for marker in select value from jsonb_array_elements(ids) loop
  if not exists(select 1 from jsonb_array_elements(body->'blocks') b where b->'id'=marker and p_selected ? (b->>'id')) then raise exception 'invalid_lineage_change';end if;
 end loop;
 for block in select value from jsonb_array_elements(body->'blocks') where p_selected ? (value->>'id') loop
  if exists(select 1 from jsonb_array_elements(block->'sources') r join kinnso_internal.discovery_source_provenance sp on sp.source_id=(r->>'sourceId')::uuid)
   and not (ids @> jsonb_build_array(block->'id')) then raise exception 'invalid_lineage_change';end if;
 end loop;
end $$;

create or replace function kinnso_internal.discovery_bind_guide() returns trigger language plpgsql security definer set search_path='' as $$
declare h kinnso_internal.studio_handoffs; body jsonb; d record; s record; block_id text; ids uuid[];
begin
 select h1.* into h from kinnso_internal.studio_write_permits p join kinnso_internal.studio_handoffs h1 on h1.id=p.handoff_id
 where p.transaction_id=txid_current() and p.guide_id=new.guide_id and p.operation='publish';
 if h.id is null then return new;end if;
 select v.body into body from public.studio_artifact_versions v where artifact_id=h.artifact_id and revision=h.artifact_revision;
 select array_agg((r->>'sourceId')::uuid) into ids from jsonb_array_elements(h.source_refs) r;
 perform kinnso_internal.discovery_bind('guide_version',new.guide_id,new.version,array['root_metadata'],ids);
 for d in select value,ordinality from jsonb_array_elements(new.content->'days') with ordinality loop
  for s in select value,ordinality from jsonb_array_elements(d.value->'stops') with ordinality loop
   block_id:=h.payload->'content'->'days'->(d.ordinality::integer-1)->'stops'->(s.ordinality::integer-1)->>'studioBlockId';
   select array_agg((r->>'sourceId')::uuid) into ids from jsonb_array_elements(body->'blocks') b cross join lateral jsonb_array_elements(b->'sources') r where b->>'id'=block_id;
   perform kinnso_internal.discovery_bind('guide_version',new.guide_id,new.version,array['title','description'],ids,new.guide_id,new.version,(s.value->>'id')::uuid);
  end loop;
 end loop;
 -- C1 creates blank day headings; subsequent editor headings are authored fields,
 -- not generated source excerpts. Do not attach unrelated stop licenses to them.
 return new;
end $$;
create or replace function kinnso_internal.discovery_bind_adoption() returns trigger language plpgsql security definer set search_path='' as $$
declare ids uuid[];
begin
 if new.source_guide_id is null then return new;end if;
 if tg_table_name='trip_days' then
  select array_agg(distinct source_id) into ids from kinnso_internal.discovery_derivative_bindings where target_kind='guide_version'
   and target_id=new.source_guide_id and target_version=new.source_guide_version and field_path='day_title' and upstream_stop_id=new.source_guide_day_id;
  perform kinnso_internal.discovery_bind('trip_day',new.id,1,array['day_title'],ids,new.source_guide_id,new.source_guide_version,new.source_guide_day_id);
 else
  select array_agg(distinct source_id) into ids from kinnso_internal.discovery_derivative_bindings where target_kind='guide_version'
   and target_id=new.source_guide_id and target_version=new.source_guide_version and field_path in('title','description') and upstream_stop_id=new.source_guide_stop_id;
  perform kinnso_internal.discovery_bind('trip_stop',new.id,1,array['title','sourceDescription'],ids,new.source_guide_id,new.source_guide_version,new.source_guide_stop_id);
 end if;
 return new;
end $$;
revoke all on function kinnso_internal.discovery_strip_markers(jsonb),kinnso_internal.discovery_record_markers(uuid,integer,jsonb),
 kinnso_internal.discovery_restore_markers(uuid,jsonb),kinnso_internal.discovery_assert_markers(jsonb,uuid,integer,jsonb) from public,anon,authenticated,service_role;
