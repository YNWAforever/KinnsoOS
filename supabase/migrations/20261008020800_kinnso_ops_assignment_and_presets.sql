-- N10 routing is additive. Existing signal ordering and review permissions remain.
-- Internal tables have no API grants; authenticated callers use the guarded RPCs.
create table kinnso_internal.review_assignments (
 submission_id uuid primary key references public.mission_milestone_submissions(id) on delete cascade,
 member_id uuid references public.kinnso_ops_members(id) on delete restrict,
 revision integer not null default 1 check(revision>0),
 updated_at timestamptz not null default now()
);
create index review_assignments_member_submission on kinnso_internal.review_assignments(member_id,submission_id);
create table kinnso_internal.review_presets (
 id uuid primary key,
 member_id uuid not null references public.kinnso_ops_members(id) on delete cascade,
 name text not null check(length(btrim(name)) between 1 and 80),
 filter jsonb not null,
 revision integer not null default 1 check(revision>0),
 deleted_at timestamptz,
 updated_at timestamptz not null default now()
);
create index review_presets_member_updated on kinnso_internal.review_presets(member_id,updated_at desc,id) where deleted_at is null;
create table kinnso_internal.review_routing_requests (
 actor_id uuid not null references auth.users(id) on delete cascade,
 request_id uuid not null,
 digest text not null,
 result jsonb not null,
 created_at timestamptz not null default now(),
 primary key(actor_id,request_id)
);
alter table kinnso_internal.review_assignments enable row level security;
alter table kinnso_internal.review_presets enable row level security;
alter table kinnso_internal.review_routing_requests enable row level security;
revoke all on kinnso_internal.review_assignments,kinnso_internal.review_presets,kinnso_internal.review_routing_requests from public,anon,authenticated,service_role;

create function kinnso_internal.review_filter(p_filter jsonb) returns void language plpgsql immutable set search_path='' as $$
begin
 perform kinnso_internal.keys(p_filter,array['missionId','status','assignment','order']);
 if (p_filter ? 'missionId' and (jsonb_typeof(p_filter->'missionId') is distinct from 'string' or p_filter->>'missionId' !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'))
 or (p_filter ? 'status' and (jsonb_typeof(p_filter->'status') is distinct from 'string' or p_filter->>'status' not in ('submitted','revision_requested')))
 or (p_filter ? 'assignment' and (jsonb_typeof(p_filter->'assignment') is distinct from 'string' or p_filter->>'assignment' not in ('mine','unassigned')))
 or (p_filter ? 'order' and (jsonb_typeof(p_filter->'order') is distinct from 'string' or p_filter->>'order' not in ('signal','deadline'))) then raise exception 'invalid_filter';end if;
end $$;
revoke all on function kinnso_internal.review_filter(jsonb) from public,anon,authenticated,service_role;

create function public.get_kinnso_review_routing() returns jsonb language plpgsql security definer set search_path='' as $$
declare a uuid:=kinnso_internal.actor();m public.kinnso_ops_members;begin
 select * into m from public.kinnso_ops_members where user_id=a and status='active' for share;
 if not found then raise exception 'forbidden';end if;
 return jsonb_build_object('memberId',m.id,'canAssign',m.role in ('owner','admin'),
  'members',coalesce((select jsonb_agg(jsonb_build_object('id',id,'name',display_name,'role',role,'status',status) order by id) from (select * from public.kinnso_ops_members order by id limit 200) x),'[]'),
  'membersTruncated',(select count(*)>200 from public.kinnso_ops_members),
  'presets',coalesce((select jsonb_agg(jsonb_build_object('id',id,'name',name,'filter',filter,'revision',revision) order by updated_at desc,id) from kinnso_internal.review_presets where member_id=m.id and deleted_at is null),'[]'));
end $$;

create function public.set_kinnso_review_assignment(p_submission_id uuid,p_member_id uuid,p_expected_revision integer,p_reason text,p_request_id uuid)
returns jsonb language plpgsql security definer set search_path='' as $$
declare a uuid:=kinnso_internal.actor();actor_member uuid;old_row kinnso_internal.review_assignments;d text;r jsonb;prior kinnso_internal.review_routing_requests;begin
 select id into actor_member from public.kinnso_ops_members where user_id=a and status='active' and role in ('owner','admin') for share;
 if not found then raise exception 'forbidden';end if;
 if p_submission_id is null or p_request_id is null or p_expected_revision is null or p_expected_revision<0 or p_expected_revision>=2147483647 or coalesce(btrim(p_reason),'')='' or length(p_reason)>2000 then raise exception 'invalid_command';end if;
 perform pg_advisory_xact_lock(hashtextextended(a::text||p_request_id::text,0));
 d:=kinnso_internal.request_digest(jsonb_build_array('assignment',p_submission_id,p_member_id,p_expected_revision,p_reason)::text);
 select * into prior from kinnso_internal.review_routing_requests where actor_id=a and request_id=p_request_id;
 if found then if prior.digest<>d then raise exception 'idempotency_conflict';end if;return prior.result;end if;
 -- The parent lock serializes creation of an absent assignment as well as updates.
 perform 1 from public.mission_milestone_submissions where id=p_submission_id and status in ('submitted','revision_requested') for update;
 if not found then raise exception 'stale_status';end if;
 select * into old_row from kinnso_internal.review_assignments where submission_id=p_submission_id for update;
 if coalesce(old_row.revision,0)<>p_expected_revision then raise exception 'revision_conflict';end if;
 if p_member_id is not null then
  perform 1 from public.kinnso_ops_members where id=p_member_id and status='active' and role in ('owner','admin','moderator') for share;
  if not found then raise exception 'invalid_assignee';end if;
 end if;
 insert into kinnso_internal.review_assignments(submission_id,member_id,revision) values(p_submission_id,p_member_id,p_expected_revision+1)
 on conflict(submission_id) do update set member_id=excluded.member_id,revision=excluded.revision,updated_at=now();
 r:=jsonb_build_object('submissionId',p_submission_id,'memberId',p_member_id,'revision',p_expected_revision+1,'requestId',p_request_id);
 insert into public.ops_audit_log(actor_ops_member_id,entity_type,entity_id,action,reason,metadata)
 values(actor_member,'mission_submission',p_submission_id,'review.assign',p_reason,jsonb_build_object('beforeMemberId',old_row.member_id,'afterMemberId',p_member_id,'beforeRevision',p_expected_revision,'revision',p_expected_revision+1,'requestId',p_request_id));
 insert into kinnso_internal.review_routing_requests(actor_id,request_id,digest,result)values(a,p_request_id,d,r);
 return r;
end $$;

create function public.command_kinnso_review_preset(p_id uuid,p_expected_revision integer,p_request_id uuid,p_command jsonb)
returns jsonb language plpgsql security definer set search_path='' as $$
declare a uuid:=kinnso_internal.actor();member uuid;old_row kinnso_internal.review_presets;d text;r jsonb;prior kinnso_internal.review_routing_requests;kind text;begin
 -- Serialize per-owner creation limits, changes and lifecycle revocation.
 select id into member from public.kinnso_ops_members where user_id=a and status='active' for update;
 if not found then raise exception 'forbidden';end if;
 perform kinnso_internal.keys(p_command,array['type','name','filter']);kind:=p_command->>'type';
 if p_id is null or p_request_id is null or p_expected_revision is null or p_expected_revision<0 or p_expected_revision>=2147483647 or kind is null or kind not in ('save','delete') then raise exception 'invalid_command';end if;
 if kind='save' then
  if jsonb_typeof(p_command->'name') is distinct from 'string' or length(btrim(p_command->>'name')) not between 1 and 80 then raise exception 'invalid_command';end if;
  perform kinnso_internal.review_filter(p_command->'filter');
 elsif p_command ? 'name' or p_command ? 'filter' then raise exception 'invalid_command';end if;
 perform pg_advisory_xact_lock(hashtextextended(a::text||p_request_id::text,0));
 d:=kinnso_internal.request_digest(jsonb_build_array('preset',p_id,p_expected_revision,p_command)::text);
 select * into prior from kinnso_internal.review_routing_requests where actor_id=a and request_id=p_request_id;
 if found then if prior.digest<>d then raise exception 'idempotency_conflict';end if;return prior.result;end if;
 perform pg_advisory_xact_lock(hashtextextended('ops-preset:'||p_id::text,0));
 select * into old_row from kinnso_internal.review_presets where id=p_id for update;
 if found and (old_row.member_id<>member or old_row.deleted_at is not null) then raise exception 'preset_not_found';end if;
 if coalesce(old_row.revision,0)<>p_expected_revision then raise exception 'revision_conflict';end if;
 if kind='save' then
  if old_row.id is null and (select count(*) from kinnso_internal.review_presets where member_id=member and deleted_at is null)>=20 then raise exception 'preset_limit';end if;
  insert into kinnso_internal.review_presets(id,member_id,name,filter,revision)values(p_id,member,btrim(p_command->>'name'),p_command->'filter',p_expected_revision+1)
  on conflict(id) do update set name=excluded.name,filter=excluded.filter,revision=excluded.revision,updated_at=now();
  r:=jsonb_build_object('id',p_id,'name',btrim(p_command->>'name'),'filter',p_command->'filter','revision',p_expected_revision+1,'requestId',p_request_id);
 else
  if old_row.id is null then raise exception 'preset_not_found';end if;
  update kinnso_internal.review_presets set deleted_at=now(),revision=revision+1,updated_at=now()where id=p_id;
  r:=jsonb_build_object('id',p_id,'revision',p_expected_revision+1,'deleted',true,'requestId',p_request_id);
 end if;
 insert into kinnso_internal.review_routing_requests(actor_id,request_id,digest,result)values(a,p_request_id,d,r);return r;
end $$;

create or replace function public.get_kinnso_review_queue(p_filter jsonb default '{}',p_cursor jsonb default null,p_limit integer default 50)
returns jsonb language plpgsql stable security definer set search_path='' as $$
declare a uuid:=kinnso_internal.actor();member uuid;scope text;items jsonb;cursor jsonb;begin
 if not public.is_active_ops_role('analyst') then raise exception 'forbidden';end if;
 select id into member from public.kinnso_ops_members where user_id=a and status='active';
 perform kinnso_internal.review_filter(p_filter);
 if p_limit is null or p_limit<1 or p_limit>50 then raise exception 'invalid_filter';end if;
 -- Preserve the original scope for existing links; bind mine cursors to the actor.
 scope:=kinnso_internal.request_digest(p_filter::text||case when p_filter->>'assignment'='mine' then ':'||member::text else '' end);
 if p_cursor is not null then
  perform kinnso_internal.keys(p_cursor,array['bucket','deadline','id','scope']);
  if p_cursor->>'scope' is distinct from scope or jsonb_typeof(p_cursor->'bucket') is distinct from 'number' or (p_cursor->>'bucket')::integer not between 0 and 2 or p_cursor->>'id' is null or p_cursor->>'deadline' is null then raise exception 'invalid_cursor';end if;
 end if;
 with queue as (
  select s.id,s.status,s.submitted_at,s.review_deadline,p.mission_id,p.creator_id,m.title,m.mission_type,j.confidence_status,
   case when p_filter->>'order'='deadline' then 0 else case j.confidence_status when 'verified_signal' then 0 when 'needs_review' then 1 else 2 end end bucket,
   coalesce(s.review_deadline,'infinity'::timestamptz) deadline,
   assignment.member_id,coalesce(assignment.revision,0) assignment_revision,
   coalesce(assignee.status='active' and assignee.role in ('owner','admin','moderator'),false) assignee_available
  from public.mission_milestone_submissions s
  join public.mission_participants p on p.id=s.mission_participant_id
  join public.missions m on m.id=p.mission_id
  left join lateral(select confidence_status from public.mission_verification_jobs where mission_milestone_submission_id=s.id order by created_at desc,id desc limit 1) j on true
  left join kinnso_internal.review_assignments assignment on assignment.submission_id=s.id
  left join public.kinnso_ops_members assignee on assignee.id=assignment.member_id
  where s.status in ('submitted','revision_requested') and (p_filter->>'status' is null or s.status=p_filter->>'status')
   and (p_filter->>'missionId' is null or p.mission_id=(p_filter->>'missionId')::uuid)
   and (p_filter->>'assignment' is null or (p_filter->>'assignment'='mine' and assignment.member_id=member) or (p_filter->>'assignment'='unassigned' and assignment.member_id is null))
 ),page as (
  select * from queue where p_cursor is null or (bucket,deadline,id)>((p_cursor->>'bucket')::integer,(p_cursor->>'deadline')::timestamptz,(p_cursor->>'id')::uuid)
  order by bucket,deadline,id limit p_limit+1
 ),numbered as(select *,row_number() over(order by bucket,deadline,id) n from page)
 select coalesce(jsonb_agg(jsonb_build_object('submissionId',id,'missionId',mission_id,'missionTitle',title,'missionType',mission_type,'creatorId',creator_id,'status',status,'submittedAt',submitted_at,'reviewDeadline',review_deadline,'confidenceStatus',confidence_status,'assignedMemberId',member_id,'assignmentRevision',assignment_revision,'assigneeAvailable',assignee_available) order by bucket,deadline,id) filter(where n<=p_limit),'[]'),
  case when count(*)>p_limit then (select jsonb_build_object('bucket',bucket,'deadline',deadline::text,'id',id,'scope',scope)from numbered where n=p_limit)else null end
 into items,cursor from numbered;
 return jsonb_build_object('items',items,'nextCursor',cursor);
end $$;
revoke all on function public.get_kinnso_review_routing(),public.set_kinnso_review_assignment(uuid,uuid,integer,text,uuid),public.command_kinnso_review_preset(uuid,integer,uuid,jsonb) from public,anon,authenticated,service_role;
grant execute on function public.get_kinnso_review_routing(),public.set_kinnso_review_assignment(uuid,uuid,integer,text,uuid),public.command_kinnso_review_preset(uuid,integer,uuid,jsonb) to authenticated;
