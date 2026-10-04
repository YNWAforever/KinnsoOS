alter table public.kinnso_place_reports add column assigned_to uuid references auth.users(id) on delete set null,add column revision integer not null default 1;
create function public.get_kinnso_place_report_queue(p_ops boolean default false,p_after uuid default null)returns jsonb language plpgsql stable security definer set search_path='' as $$
declare a uuid:=kinnso_internal.actor();rows jsonb;cursor uuid;begin
 if p_ops and not exists(select 1 from public.kinnso_ops_members where user_id=a and status='active')then raise exception 'forbidden';end if;
 with bounded as(select *,row_number()over(order by id)rn from public.kinnso_place_reports where(p_ops or owner_id=a)and(p_after is null or id>p_after)and(not p_ops or status<>'resolved')order by id limit 51)
 select coalesce(jsonb_agg(jsonb_build_object('id',id,'placeId',place_id,'reason',reason,'status',status,'createdAt',created_at,'updatedAt',updated_at,'reviewReason',review_reason,'assignedTo',assigned_to,'revision',revision)order by id)filter(where rn<=50),'[]'),case when count(*)>50 then(array_agg(id order by id))[50]else null end into rows,cursor from bounded;
 return jsonb_build_object('items',rows,'nextCursor',cursor);
end $$;
create function public.apply_kinnso_place_report_command(p_report_id uuid,p_expected_revision integer,p_request_id uuid,p_command jsonb)returns jsonb language plpgsql security definer set search_path='' as $$
declare a uuid:=kinnso_internal.actor();r public.kinnso_place_reports;kind text:=p_command->>'type';v_reason text:=btrim(p_command->>'reason');digest text;prior kinnso_internal.requests;owner uuid;result jsonb;begin
 perform kinnso_internal.keys(p_command,array['type','reason','ownerId']);if p_request_id is null or p_expected_revision is null then raise exception 'invalid_report';end if;
 if kind<>'revise' or kind is null then perform 1 from public.kinnso_ops_members where user_id=a and status='active'and role in ('owner','admin','moderator')for share;if not found then raise exception 'forbidden';end if;end if;
 select * into r from public.kinnso_place_reports where id=p_report_id for update;if not found or(kind='revise'and r.owner_id<>a)then raise exception 'report_not_found';end if;
 perform pg_advisory_xact_lock(hashtextextended(a::text||p_request_id::text,0));digest:=kinnso_internal.request_digest(jsonb_build_array('place_report',p_report_id,p_expected_revision,p_command)::text);select * into prior from kinnso_internal.requests where actor_id=a and request_id=p_request_id;if found then if prior.digest<>digest then raise exception 'idempotency_conflict';end if;return prior.result;end if;
 if r.revision<>p_expected_revision then raise exception 'revision_conflict';end if;
 if v_reason is null or length(v_reason)not between 10 and 2000 then raise exception 'invalid_report';end if;
 if kind='assign' then owner:=(p_command->>'ownerId')::uuid;if not exists(select 1 from public.kinnso_ops_members where user_id=owner and status='active'and role in ('owner','admin','moderator'))then raise exception 'invalid_owner';end if;update public.kinnso_place_reports set assigned_to=owner,revision=revision+1,updated_at=now()where id=r.id;
 elsif kind='requestRevision' then
  if r.status='resolved'then raise exception 'invalid_report';end if;update public.kinnso_place_reports set status='reviewed',reviewed_by=a,review_reason=v_reason,revision=revision+1,updated_at=now()where id=r.id;
  insert into kinnso_internal.inbox_events(recipient_id,event_type,entity_type,entity_id)values(r.owner_id,'place.report_revision','place_report',r.id);
 elsif kind='resolve' then
  if r.status='resolved'then raise exception 'invalid_report';end if;update public.kinnso_place_reports set status='resolved',reviewed_by=a,review_reason=v_reason,revision=revision+1,updated_at=now()where id=r.id;
  insert into kinnso_internal.inbox_events(recipient_id,event_type,entity_type,entity_id)values(r.owner_id,'place.report_resolved','place_report',r.id);
 elsif kind='revise' then
  if r.status<>'reviewed'then raise exception 'invalid_report';end if;update public.kinnso_place_reports set reason=v_reason,status='open',revision=revision+1,updated_at=now()where id=r.id;
 else raise exception 'invalid_report';end if;
 insert into kinnso_internal.place_report_audit(report_id,actor_id,status,reason)values(r.id,a,kind,v_reason);
 select jsonb_build_object('id',id,'status',status,'revision',revision,'assignedTo',assigned_to)into result from public.kinnso_place_reports where id=r.id;insert into kinnso_internal.requests values(a,p_request_id,digest,result,now());return result;
end $$;
-- Existing clients retain their RPC signature while receiving fresh authorization, audit and notification.
create or replace function public.review_kinnso_place_report(p_report_id uuid,p_status text,p_reason text)returns jsonb language plpgsql security definer set search_path='' as $$
declare n integer;begin
 if p_status is null or p_status not in('reviewed','resolved')then raise exception 'invalid_report';end if;
 select revision into n from public.kinnso_place_reports where id=p_report_id for update;
 return public.apply_kinnso_place_report_command(p_report_id,n,gen_random_uuid(),jsonb_build_object('type',case when p_status='resolved'then 'resolve'else 'requestRevision'end,'reason',p_reason));
end $$;
create function public.get_kinnso_review_submission(p_id uuid)returns jsonb language plpgsql stable security definer set search_path='' as $$
declare a uuid:=kinnso_internal.actor();result jsonb;begin
 if not exists(select 1 from public.kinnso_ops_members where user_id=a and status='active')then raise exception 'forbidden';end if;
 select jsonb_build_object('id',s.id,'status',s.status,'proofUrls',s.proof_urls,'notes',s.notes,'submittedAt',s.submitted_at,'deadline',s.review_deadline,'missionTitle',m.title)into result from public.mission_milestone_submissions s join public.mission_participants p on p.id=s.mission_participant_id join public.missions m on m.id=p.mission_id where s.id=p_id;
 if result is null then raise exception 'submission_not_found';end if;return result;
end $$;
revoke all on function public.get_kinnso_place_report_queue(boolean,uuid),public.apply_kinnso_place_report_command(uuid,integer,uuid,jsonb),public.review_kinnso_place_report(uuid,text,text),public.get_kinnso_review_submission(uuid) from public,anon,authenticated,service_role;
grant execute on function public.get_kinnso_place_report_queue(boolean,uuid),public.apply_kinnso_place_report_command(uuid,integer,uuid,jsonb),public.review_kinnso_place_report(uuid,text,text),public.get_kinnso_review_submission(uuid)to authenticated;
