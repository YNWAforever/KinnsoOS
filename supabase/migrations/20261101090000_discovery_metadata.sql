-- N01 REVIEW CANDIDATE. NOT APPLIED / NOT DB-VERIFIED.
-- Native activation is a separate review. No browser/service-role direct access.
-- External owner proof, verified rights and licensed writers remain unavailable.
create table public.discovery_preferences (
 owner_actor_id uuid primary key references auth.users(id) on delete cascade,
 revision integer not null check(revision>0),
 body jsonb not null check(jsonb_typeof(body)='object' and octet_length(body::text)<=8000),
 updated_at timestamptz not null default now()
);
create table public.trip_intents (
 id uuid primary key, owner_actor_id uuid not null references auth.users(id) on delete cascade,
 revision integer not null check(revision>0), status text not null check(status in('active','archived')),
 body jsonb not null check(jsonb_typeof(body)='object' and octet_length(body::text)<=8000),
 linked_trip_id uuid references public.trips(id) on delete set null,
 created_at timestamptz not null default now(), updated_at timestamptz not null default now(),
 unique(id,owner_actor_id)
);
create index discovery_intent_owner on public.trip_intents(owner_actor_id,updated_at,id);
create table public.merchant_links (
 id uuid primary key, company_id uuid not null references public.merchant_profiles(id),
 sme_workspace_id text, location_ids text[] not null default '{}', link_version integer not null default 1 check(link_version>0),
 status text not null default 'unverified' check(status in('pending','active','revoked','unverified')),
 proof_digest text check(proof_digest ~ '^[a-f0-9]{64}$'), verified_at timestamptz,
 credential_ref text, read_refresh_allowed boolean not null default false,
 check(cardinality(location_ids) between 0 and 20),
 check(status<>'active' or (sme_workspace_id is not null and proof_digest is not null and verified_at is not null))
);
create table public.offer_imports (
 id uuid primary key, link_id uuid not null references public.merchant_links(id),
 external_offer_id text not null, source_revision integer not null check(source_revision>0),
 source_hash text not null check(source_hash ~ '^[a-f0-9]{64}$'),
 source_location_id text, applied_location_id text not null,
 source_scope_version integer not null check(source_scope_version>0), observed_at timestamptz not null,
 fields jsonb not null check(jsonb_typeof(fields)='object' and octet_length(fields::text)<=32000),
 unique(link_id,external_offer_id,source_revision,applied_location_id)
);
create table public.offer_publications (
 id uuid primary key, company_id uuid not null references public.merchant_profiles(id),
 import_id uuid not null references public.offer_imports(id), revision integer not null check(revision>0),
 content_version integer not null default 0 check(content_version>=0), content_hash text check(content_hash ~ '^[a-f0-9]{64}$'),
 preview_digest text check(preview_digest ~ '^[a-f0-9]{64}$'),
 status text not null default 'draft' check(status in('draft','published','withdrawn')),
 published_at timestamptz, withdrawn_at timestamptz, unique(id,company_id),
 check((content_version=0 and status='draft' and content_hash is null and preview_digest is null and published_at is null)
 or (content_version>0 and content_hash is not null and preview_digest is not null))
);
create table public.offer_publication_versions (
 publication_id uuid not null references public.offer_publications(id), content_version integer not null check(content_version>0),
 content_hash text not null check(content_hash ~ '^[a-f0-9]{64}$'),
 body jsonb not null check(jsonb_typeof(body)='object' and octet_length(body::text)<=40000),
 created_at timestamptz not null default now(), primary key(publication_id,content_version),
 unique(publication_id,content_version,content_hash)
);
create table public.match_runs (
 id uuid primary key, owner_actor_id uuid not null references auth.users(id) on delete cascade,
 intent_id uuid not null, intent_revision integer not null check(intent_revision>0),
 policy_version text not null check(policy_version='matching-v1'),
 candidate_set_hash text not null check(candidate_set_hash ~ '^[a-f0-9]{64}$'),
 references_only jsonb not null check(jsonb_typeof(references_only)='array' and jsonb_array_length(references_only)<=100),
 coverage jsonb not null check(jsonb_typeof(coverage)='object'), computed_at timestamptz not null default now(),
 foreign key(intent_id,owner_actor_id) references public.trip_intents(id,owner_actor_id) on delete cascade
);
create index discovery_match_retention on public.match_runs(computed_at);
create table public.match_choices (
 owner_actor_id uuid not null references auth.users(id) on delete cascade, intent_id uuid not null,
 publication_id uuid not null references public.offer_publications(id), revision integer not null check(revision>0),
 choice text not null check(choice in('saved','dismissed','cleared')), updated_at timestamptz not null default now(),
 primary key(owner_actor_id,intent_id,publication_id),
 foreign key(intent_id,owner_actor_id) references public.trip_intents(id,owner_actor_id) on delete cascade
);
create table kinnso_internal.discovery_requests (
 actor_id uuid not null references auth.users(id) on delete cascade, request_id uuid not null,
 command_digest text not null check(command_digest ~ '^[a-f0-9]{64}$'), kind text not null,
 resource_id uuid not null, revision integer not null check(revision>0),
 created_at timestamptz not null default now(), primary key(actor_id,request_id)
);
create table kinnso_internal.discovery_tombstones (
 resource_kind text not null check(resource_kind='intent'), resource_id uuid not null,
 actor_id uuid not null references auth.users(id) on delete cascade,
 deleted_at timestamptz not null default now(), primary key(resource_kind,resource_id)
);
create table kinnso_internal.discovery_gate (
 singleton boolean primary key default true check(singleton), private_writes boolean not null default false
);
insert into kinnso_internal.discovery_gate(singleton) values(true);
create table kinnso_internal.discovery_maintenance_audit (
 id uuid primary key default gen_random_uuid(), at timestamptz not null default now(),
 cutoff_at timestamptz not null, removed_matches integer not null, removed_intents integer not null
);
alter table public.discovery_preferences enable row level security;
alter table public.trip_intents enable row level security;
alter table public.merchant_links enable row level security;
alter table public.offer_imports enable row level security;
alter table public.offer_publications enable row level security;
alter table public.offer_publication_versions enable row level security;
alter table public.match_runs enable row level security;
alter table public.match_choices enable row level security;
alter table kinnso_internal.discovery_requests enable row level security;
alter table kinnso_internal.discovery_tombstones enable row level security;
alter table kinnso_internal.discovery_gate enable row level security;
alter table kinnso_internal.discovery_maintenance_audit enable row level security;
revoke all on public.discovery_preferences,public.trip_intents,public.merchant_links,public.offer_imports,
 public.offer_publications,public.offer_publication_versions,public.match_runs,public.match_choices,
 kinnso_internal.discovery_requests,kinnso_internal.discovery_tombstones,kinnso_internal.discovery_gate,
 kinnso_internal.discovery_maintenance_audit from public,anon,authenticated,service_role;

-- Canonical JSON matching the existing stableJson command digest. ASCII contract keys.
create function kinnso_internal.discovery_canonical(p_value jsonb) returns text
language sql immutable set search_path='' as $$
 select case jsonb_typeof(p_value)
 when 'object' then '{'||coalesce((select string_agg(to_jsonb(key)::text||':'||kinnso_internal.discovery_canonical(value),',' order by key collate "C") from jsonb_each(p_value)),'')||'}'
 when 'array' then '['||coalesce((select string_agg(kinnso_internal.discovery_canonical(value),',' order by ord) from jsonb_array_elements(p_value) with ordinality x(value,ord)),'')||']'
 else p_value::text end;
$$;
create function kinnso_internal.discovery_strings(p_value jsonb,p_max integer,p_allowed text[] default null) returns void
language plpgsql immutable set search_path='' as $$
begin
 if jsonb_typeof(p_value) is distinct from 'array' or jsonb_array_length(p_value)>p_max then raise exception 'invalid_discovery_list'; end if;
 if exists(select 1 from jsonb_array_elements(p_value) x(v) where jsonb_typeof(v)<>'string' or length(btrim(v#>>'{}')) not between 1 and 120
 or v#>>'{}' ~ '[\x00-\x08\x0B\x0C\x0E-\x1F]' or (p_allowed is not null and not(v#>>'{}'=any(p_allowed))))
 or (select count(*)<>count(distinct v) from jsonb_array_elements(p_value) x(v)) then raise exception 'invalid_discovery_list'; end if;
end $$;
create function kinnso_internal.discovery_validate(p_body jsonb,p_preferences boolean) returns void
language plpgsql immutable set search_path='' as $$
declare dates jsonb:=p_body->'dateSpec'; start_day date; end_day date; budget jsonb:=p_body->'budget';
begin
 if jsonb_typeof(p_body) is distinct from 'object' then raise exception 'invalid_discovery_body'; end if;
 if p_preferences then
  perform kinnso_internal.keys(p_body,array['favoriteCityKeys','interestTags','languages']);
  perform kinnso_internal.discovery_strings(p_body->'favoriteCityKeys',20,array['city:hk:hong-kong']);
 else
  perform kinnso_internal.keys(p_body,array['cityKey','dateSpec','budget','interestTags','languages','linkedTripId']);
  if p_body->>'cityKey' is distinct from 'city:hk:hong-kong' then raise exception 'invalid_discovery_city'; end if;
  if jsonb_typeof(dates) is distinct from 'object' then raise exception 'invalid_discovery_dates'; end if;
  if dates->>'kind'='undecided' then perform kinnso_internal.keys(dates,array['kind']);
  elsif dates->>'kind' in('fixed','window') then
   if dates->>'kind'='fixed' then
    perform kinnso_internal.keys(dates,array['kind','start','end']);
    if coalesce(dates->>'start','')!~'^\d{4}-\d{2}-\d{2}$' or coalesce(dates->>'end','')!~'^\d{4}-\d{2}-\d{2}$' then raise exception 'invalid_discovery_dates'; end if;
    start_day:=(dates->>'start')::date;end_day:=(dates->>'end')::date;
   else
    perform kinnso_internal.keys(dates,array['kind','earliest','latest']);
    if coalesce(dates->>'earliest','')!~'^\d{4}-\d{2}-\d{2}$' or coalesce(dates->>'latest','')!~'^\d{4}-\d{2}-\d{2}$' then raise exception 'invalid_discovery_dates'; end if;
    start_day:=(dates->>'earliest')::date;end_day:=(dates->>'latest')::date;
   end if;
   if end_day<start_day or end_day-start_day>=90 then raise exception 'invalid_discovery_dates'; end if;
  else raise exception 'invalid_discovery_dates';end if;
  if budget is null then raise exception 'invalid_discovery_budget'; end if;
  if budget<>'null'::jsonb then
   perform kinnso_internal.keys(budget,array['currency','maxPerPersonMinor']);
   if coalesce(budget->>'currency','') not in('HKD','TWD') or jsonb_typeof(budget->'maxPerPersonMinor') is distinct from 'number'
    or coalesce(budget->>'maxPerPersonMinor','')!~'^(0|[1-9][0-9]{0,8})$' or (budget->>'maxPerPersonMinor')::numeric>100000000 then raise exception 'invalid_discovery_budget'; end if;
  end if;
 end if;
 perform kinnso_internal.discovery_strings(p_body->'interestTags',10);
 perform kinnso_internal.discovery_strings(p_body->'languages',5,array['en','zh-HK','zh-TW']);
end $$;
create function kinnso_internal.discovery_intent_snapshot(p_id uuid,p_actor uuid) returns jsonb
language sql stable set search_path='' as $$
 select (t.body-'linkedTripId')||jsonb_build_object('id',t.id,'ownerActorId',t.owner_actor_id,'revision',t.revision,'status',t.status,'createdAt',t.created_at,'updatedAt',t.updated_at)
 ||case when t.linked_trip_id is null then '{}'::jsonb else jsonb_build_object('linkedTripId',t.linked_trip_id) end
 from public.trip_intents t where t.id=p_id and t.owner_actor_id=p_actor;
$$;
create function public.get_kinnso_discovery_request(p_request_id uuid) returns jsonb
language plpgsql stable security definer set search_path='' as $$
declare actor uuid:=kinnso_internal.actor(); r kinnso_internal.discovery_requests;
begin
 select * into r from kinnso_internal.discovery_requests where actor_id=actor and request_id=p_request_id;
 if not found then return jsonb_build_object('status','unknown','requestId',p_request_id);end if;
 -- Minimal immutable receipt, never a snapshot of private/source text.
 return jsonb_build_object('status','complete','receipt',jsonb_build_object('requestId',r.request_id,'commandDigest',r.command_digest,'resourceId',r.resource_id,'revision',r.revision),
 'resourceState',case when r.kind in('saveIntent','archiveIntent','deleteIntent') and exists(select 1 from kinnso_internal.discovery_tombstones where resource_kind='intent' and resource_id=r.resource_id and actor_id=actor) then 'deleted' else 'present' end);
end $$;
create function public.apply_kinnso_discovery_command(p_target_id uuid,p_expected_revision integer,p_request_id uuid,p_command jsonb) returns jsonb
language plpgsql security definer set search_path='' as $$
declare actor uuid:=kinnso_internal.actor(); prior kinnso_internal.discovery_requests; digest text;
 kind text:=p_command->>'kind'; body jsonb:=p_command->'data'; current_rev integer; next_rev integer; trip uuid; r jsonb;
begin
 if p_target_id is null or p_request_id is null or p_expected_revision is null or p_expected_revision<0
  or jsonb_typeof(p_command) is distinct from 'object' or octet_length(p_command::text)>32768 then raise exception 'invalid_discovery_command';end if;
 perform kinnso_internal.keys(p_command,array['kind','data']);
 if kind is null or kind not in('savePreferences','clearPreferences','saveIntent','archiveIntent','deleteIntent',
 'beginLink','confirmLink','revokeLink','importOffer','preparePublication','grantContentUse','revokeContentUse','publishOffer','withdrawOffer','recordMatch','chooseOffer') then raise exception 'invalid_discovery_command';end if;
 perform pg_advisory_xact_lock(hashtextextended('discovery-request:'||actor::text||p_request_id::text,0));
 digest:=kinnso_internal.request_digest(kinnso_internal.discovery_canonical(jsonb_build_object('requestId',p_request_id,'targetId',p_target_id,'expectedRevision',p_expected_revision,'command',p_command)));
 select * into prior from kinnso_internal.discovery_requests where actor_id=actor and request_id=p_request_id;
 if found then
  if prior.command_digest<>digest then raise exception 'idempotency_conflict';end if;
  r:=public.get_kinnso_discovery_request(p_request_id);return jsonb_build_object('ok',true,'receipt',r->'receipt');
 end if;
 if (select private_writes from kinnso_internal.discovery_gate where singleton) is distinct from true then raise exception 'discovery_unavailable';end if;
 -- External proof/rights/reader prerequisites are deliberately not replaceable by client flags.
 if kind not in('savePreferences','clearPreferences','saveIntent','archiveIntent','deleteIntent') then raise exception 'discovery_native_authority_unavailable';end if;
 -- Actor before target: serializes quota check + insertion across different IDs.
 perform pg_advisory_xact_lock(hashtextextended('discovery-owner:'||actor::text,0));
 perform pg_advisory_xact_lock(hashtextextended('discovery-target:'||p_target_id::text,0));
 if kind in('savePreferences','clearPreferences') then
  if p_target_id<>actor then raise exception 'discovery_forbidden';end if;
  select revision into current_rev from public.discovery_preferences where owner_actor_id=actor for update;
  if coalesce(current_rev,0)<>p_expected_revision then raise exception 'revision_conflict';end if;
  if kind='clearPreferences' then
   if body is distinct from '{}'::jsonb then raise exception 'invalid_discovery_command';end if;
   body:='{"favoriteCityKeys":[],"interestTags":[],"languages":[]}'::jsonb;
  end if;
  perform kinnso_internal.discovery_validate(body,true);next_rev:=coalesce(current_rev,0)+1;
  insert into public.discovery_preferences(owner_actor_id,revision,body) values(actor,next_rev,body)
   on conflict(owner_actor_id) do update set revision=excluded.revision,body=excluded.body,updated_at=now();
 else
  if exists(select 1 from kinnso_internal.discovery_tombstones where resource_kind='intent' and resource_id=p_target_id) then raise exception 'discovery_restricted';end if;
  if exists(select 1 from public.trip_intents where id=p_target_id and owner_actor_id<>actor) then raise exception 'discovery_not_found';end if;
  select revision into current_rev from public.trip_intents where id=p_target_id and owner_actor_id=actor for update;
  if coalesce(current_rev,0)<>p_expected_revision then raise exception 'revision_conflict';end if;
  if kind<>'saveIntent' and current_rev is null then raise exception 'discovery_not_found';end if;
  next_rev:=coalesce(current_rev,0)+1;
  if kind='saveIntent' then
   perform kinnso_internal.discovery_validate(body,false);trip:=(body->>'linkedTripId')::uuid;
   if trip is not null then
    perform 1 from public.trips where id=trip and owner_user_id=actor for share;
    if not found then raise exception 'discovery_forbidden';end if;
   end if;
   if current_rev is null and (select count(*) from public.trip_intents where owner_actor_id=actor)>=100 then raise exception 'invalid_discovery_limit';end if;
   insert into public.trip_intents(id,owner_actor_id,revision,status,body,linked_trip_id) values(p_target_id,actor,next_rev,'active',body-'linkedTripId',trip)
    on conflict(id) do update set revision=excluded.revision,status='active',body=excluded.body,linked_trip_id=excluded.linked_trip_id,updated_at=now();
  else
   if body is distinct from '{}'::jsonb then raise exception 'invalid_discovery_command';end if;
   if kind='archiveIntent' then update public.trip_intents set status='archived',revision=next_rev,updated_at=now() where id=p_target_id;
   else
    insert into kinnso_internal.discovery_tombstones(resource_kind,resource_id,actor_id) values('intent',p_target_id,actor);
    -- Match/choice metadata cascade only. Existing trips/guides are never deleted.
    delete from public.trip_intents where id=p_target_id and owner_actor_id=actor;
   end if;
  end if;
 end if;
 insert into kinnso_internal.discovery_requests(actor_id,request_id,command_digest,kind,resource_id,revision) values(actor,p_request_id,digest,kind,p_target_id,next_rev);
 return jsonb_build_object('ok',true,'receipt',jsonb_build_object('requestId',p_request_id,'commandDigest',digest,'resourceId',p_target_id,'revision',next_rev));
end $$;
create function public.read_kinnso_discovery(p_scope jsonb) returns jsonb
language plpgsql stable security definer set search_path='' as $$
declare actor uuid:=kinnso_internal.actor(); result jsonb; kind text:=p_scope->>'kind';
begin
 if kind in('preferences','intents','publicOffers') then perform kinnso_internal.keys(p_scope,array['kind']);
 elsif kind in('intent','match') then perform kinnso_internal.keys(p_scope,array['kind','id']);
 elsif kind='companyOffers' then perform kinnso_internal.keys(p_scope,array['kind','companyId']);
 else raise exception 'invalid_discovery_read';end if;
 if kind='preferences' then
  select body||jsonb_build_object('ownerActorId',owner_actor_id,'revision',revision,'updatedAt',updated_at) into result from public.discovery_preferences where owner_actor_id=actor;
 elsif kind='intents' then
  select coalesce(jsonb_agg(kinnso_internal.discovery_intent_snapshot(id,actor) order by updated_at desc,id),'[]') into result from public.trip_intents where owner_actor_id=actor;
 elsif kind='intent' then
  result:=kinnso_internal.discovery_intent_snapshot((p_scope->>'id')::uuid,actor);
  if result is null then raise exception 'discovery_not_found';end if;
 else raise exception 'discovery_native_authority_unavailable';end if;
 return jsonb_build_object('ok',true,'data',result);
end $$;
-- Restricted manual maintenance only. p_now enables reproducible tests after DB approval.
-- No cron, no browser RPC grant, no cleanup of original business outputs.
create function kinnso_internal.maintain_discovery(p_now timestamptz default now()) returns jsonb
language plpgsql set search_path='' as $$
declare r record; n_matches integer; n_intents integer:=0;
begin
 if p_now is null or p_now>clock_timestamp()+interval '1 minute' then raise exception 'invalid_maintenance_clock';end if;
 delete from public.match_runs where computed_at<p_now-interval '30 days';get diagnostics n_matches=row_count;
 for r in select id,owner_actor_id from public.trip_intents where status='archived' and linked_trip_id is null and updated_at<p_now-interval '90 days' order by id loop
  perform pg_advisory_xact_lock(hashtextextended('discovery-target:'||r.id::text,0));
  perform 1 from public.trip_intents t where t.id=r.id and t.status='archived' and t.linked_trip_id is null and t.updated_at<p_now-interval '90 days'
   and not exists(select 1 from public.match_runs m where m.intent_id=t.id)
   and not exists(select 1 from public.match_choices c where c.intent_id=t.id and c.choice='saved') for update;
  if found then
   insert into kinnso_internal.discovery_tombstones(resource_kind,resource_id,actor_id,deleted_at) values('intent',r.id,r.owner_actor_id,p_now) on conflict do nothing;
   delete from public.trip_intents where id=r.id;n_intents:=n_intents+1;
  end if;
 end loop;
 insert into kinnso_internal.discovery_maintenance_audit(cutoff_at,removed_matches,removed_intents) values(p_now,n_matches,n_intents);
 return jsonb_build_object('matches',n_matches,'intents',n_intents);
end $$;
revoke all on function kinnso_internal.discovery_canonical(jsonb),kinnso_internal.discovery_strings(jsonb,integer,text[]),
 kinnso_internal.discovery_validate(jsonb,boolean),kinnso_internal.discovery_intent_snapshot(uuid,uuid),kinnso_internal.maintain_discovery(timestamptz)
 from public,anon,authenticated,service_role;
revoke all on function public.apply_kinnso_discovery_command(uuid,integer,uuid,jsonb),public.get_kinnso_discovery_request(uuid),public.read_kinnso_discovery(jsonb) from public,anon,authenticated,service_role;
grant execute on function public.apply_kinnso_discovery_command(uuid,integer,uuid,jsonb),public.get_kinnso_discovery_request(uuid),public.read_kinnso_discovery(jsonb) to authenticated;
