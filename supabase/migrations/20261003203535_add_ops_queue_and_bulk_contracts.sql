-- The review queue is ordered and filtered before LIMIT, independently of the REST rowcap.
create index kinnso_review_queue_status_deadline_id on public.mission_milestone_submissions(status,review_deadline,id);
create index kinnso_review_job_latest on public.mission_verification_jobs(mission_milestone_submission_id,created_at desc,id desc);
create function public.get_kinnso_review_queue(p_filter jsonb default '{}',p_cursor jsonb default null,p_limit integer default 50)
returns jsonb language plpgsql stable security definer set search_path='' as $$
declare v_actor uuid:=kinnso_internal.actor(); v_scope text; v_items jsonb; v_cursor jsonb;
begin
 if not public.is_active_ops_role('analyst') then raise exception 'forbidden';end if;
 perform kinnso_internal.keys(p_filter,array['status','missionId']);
 if p_limit is null or p_limit<1 or p_limit>50 or (p_filter->>'status' is not null and p_filter->>'status' not in ('submitted','revision_requested')) then raise exception 'invalid_filter';end if;
 v_scope:=kinnso_internal.request_digest(p_filter::text);
 if p_cursor is not null then
  perform kinnso_internal.keys(p_cursor,array['bucket','deadline','id','scope']);
  if p_cursor->>'scope' is distinct from v_scope or (p_cursor->>'bucket')::integer not between 0 and 2 or p_cursor->>'id' is null or p_cursor->>'deadline' is null then raise exception 'invalid_cursor';end if;
 end if;
 with queue as (
  select s.id,s.status,s.submitted_at,s.review_deadline,p.mission_id,p.creator_id,m.title,m.mission_type,j.confidence_status,
   case j.confidence_status when 'verified_signal' then 0 when 'needs_review' then 1 else 2 end bucket,
   coalesce(s.review_deadline,'infinity'::timestamptz) deadline
  from public.mission_milestone_submissions s
  join public.mission_participants p on p.id=s.mission_participant_id
  join public.missions m on m.id=p.mission_id
  left join lateral(select confidence_status from public.mission_verification_jobs where mission_milestone_submission_id=s.id order by created_at desc,id desc limit 1) j on true
  where s.status in ('submitted','revision_requested') and (p_filter->>'status' is null or s.status=p_filter->>'status')
   and (p_filter->>'missionId' is null or p.mission_id=(p_filter->>'missionId')::uuid)
 ), page as (
  select * from queue where p_cursor is null or (bucket,deadline,id)>((p_cursor->>'bucket')::integer,(p_cursor->>'deadline')::timestamptz,(p_cursor->>'id')::uuid)
  order by bucket,deadline,id limit p_limit+1
 ), numbered as(select *,row_number() over(order by bucket,deadline,id) n from page)
 select coalesce(jsonb_agg(jsonb_build_object('submissionId',id,'missionId',mission_id,'missionTitle',title,'missionType',mission_type,'creatorId',creator_id,'status',status,'submittedAt',submitted_at,'reviewDeadline',review_deadline,'confidenceStatus',confidence_status) order by bucket,deadline,id) filter(where n<=p_limit),'[]'),
  case when count(*)>p_limit then (select jsonb_build_object('bucket',bucket,'deadline',deadline::text,'id',id,'scope',v_scope) from numbered where n=p_limit) else null end
 into v_items,v_cursor from numbered;
 return jsonb_build_object('items',v_items,'nextCursor',v_cursor);
end $$;
create function public.get_kinnso_settlement_summary(p_mission_id uuid default null)
returns jsonb language plpgsql stable security definer set search_path='' as $$
declare v_actor uuid:=kinnso_internal.actor();begin
 if not public.is_active_ops_role('analyst') then raise exception 'forbidden';end if;
 return coalesce((select jsonb_agg(jsonb_build_object('currency',currency,'count',n,'creatorAmount',creator::text,'merchantAmount',merchant::text,'paidCount',paid,'disputedCount',disputed) order by currency) from (
  select amount_currency currency,count(*) n,coalesce(sum(coalesce(creator_commission_amount,0)+coalesce(paid_fee_amount,0)),0)::numeric(20,2) creator,coalesce(sum(paid_fee_amount),0)::numeric(20,2) merchant,
   count(*) filter(where status='paid') paid,count(*) filter(where status='disputed') disputed
  from public.mission_settlements where p_mission_id is null or mission_id=p_mission_id group by amount_currency
 ) x),'[]');
end $$;
create table kinnso_internal.bulk_previews(
 id uuid primary key default gen_random_uuid(),actor_id uuid not null references auth.users(id) on delete cascade,
 snapshot jsonb not null,created_at timestamptz not null default now(),run_request_id uuid,run_digest text,result jsonb,
 unique(actor_id,run_request_id)
);
alter table kinnso_internal.bulk_previews enable row level security;
revoke all on kinnso_internal.bulk_previews from public,anon,authenticated,service_role;
create function public.preview_kinnso_review_bulk(p_ids uuid[]) returns jsonb language plpgsql security definer set search_path='' as $$
declare v_actor uuid:=kinnso_internal.actor();v_snapshot jsonb;v_id uuid;begin
 if not public.is_active_ops_role('admin') then raise exception 'forbidden';end if;
 if cardinality(p_ids) is null or cardinality(p_ids)<1 or cardinality(p_ids)>100 or cardinality(p_ids)<>(select count(distinct x) from unnest(p_ids) x) then raise exception 'invalid_selection';end if;
 select jsonb_agg(jsonb_build_object('id',s.id,'status',s.status,'updatedAt',s.updated_at,'fingerprint',kinnso_internal.request_digest(to_jsonb(s)::text)) order by s.id) into v_snapshot from public.mission_milestone_submissions s where s.id=any(p_ids);
 if jsonb_array_length(coalesce(v_snapshot,'[]'))<>cardinality(p_ids) then raise exception 'invalid_selection';end if;
 insert into kinnso_internal.bulk_previews(actor_id,snapshot) values(v_actor,v_snapshot) returning id into v_id;
 return jsonb_build_object('jobId',v_id,'selectionSnapshot',v_snapshot,'scope','explicit_selection','maximum',100);
end $$;
create function public.run_kinnso_review_bulk(p_job_id uuid,p_action text,p_reason_category text,p_reason text,p_request_id uuid)
returns jsonb language plpgsql security definer set search_path='' as $$
declare v_actor uuid:=kinnso_internal.actor();v_job kinnso_internal.bulk_previews;v_prior kinnso_internal.bulk_previews;v_digest text;v_item jsonb;v_current public.mission_milestone_submissions;v_results jsonb:='[]';v_result jsonb;v_error text;begin
 -- Lock the authoritative role for the transaction; revoked/downgraded roles never replay receipts.
 perform 1 from public.kinnso_ops_members where user_id=v_actor and status='active' and role in ('owner','admin') for share;
 if not found then raise exception 'forbidden';end if;
 if p_request_id is null or p_action is null or p_action not in ('approve','reject','request_revision') or coalesce(btrim(p_reason),'')='' or length(p_reason)>2000 then raise exception 'invalid_command';end if;
 perform pg_advisory_xact_lock(hashtextextended(v_actor::text||p_request_id::text,0));
 v_digest:=kinnso_internal.request_digest(jsonb_build_array(p_job_id,p_action,p_reason_category,p_reason)::text);
 select * into v_prior from kinnso_internal.bulk_previews where actor_id=v_actor and run_request_id=p_request_id;
 if found then if v_prior.run_digest<>v_digest then raise exception 'idempotency_conflict';end if;return v_prior.result;end if;
 select * into v_job from kinnso_internal.bulk_previews where id=p_job_id and actor_id=v_actor for update;
 if not found then raise exception 'job_not_found';end if;
 if v_job.run_request_id is not null then raise exception 'idempotency_conflict';end if;
 if v_job.created_at<now()-interval '15 minutes' then raise exception 'invalid_expired_preview';end if;
 for v_item in select value from jsonb_array_elements(v_job.snapshot) loop
  begin
   if not public.is_active_ops_role('admin') then raise exception 'forbidden';end if;
   select * into v_current from public.mission_milestone_submissions where id=(v_item->>'id')::uuid for update;
   if not found or kinnso_internal.request_digest(to_jsonb(v_current)::text) is distinct from v_item->>'fingerprint' then raise exception 'stale_selection';end if;
   perform public.admin_review_submission(v_current.id,p_action,p_reason_category,p_reason);
   v_results:=v_results||jsonb_build_array(jsonb_build_object('id',v_current.id,'ok',true));
  exception when others then
   v_error:=case when sqlerrm in ('stale_selection','forbidden','insufficient_budget','currency_mismatch','stale_status','bad_reason_category','bad_reason_category_for_receipt_cashback','reason_required') then sqlerrm else 'review_failed' end;
   v_results:=v_results||jsonb_build_array(jsonb_build_object('id',v_item->>'id','ok',false,'code',v_error));
  end;
 end loop;
 select jsonb_build_object('jobId',p_job_id,'results',v_results,'succeeded',count(*) filter(where (value->>'ok')::boolean),'failed',count(*) filter(where not (value->>'ok')::boolean)) into v_result from jsonb_array_elements(v_results);
 update kinnso_internal.bulk_previews set run_request_id=p_request_id,run_digest=v_digest,result=v_result where id=p_job_id;
 return v_result;
end $$;
revoke all on function public.get_kinnso_review_queue(jsonb,jsonb,integer),public.get_kinnso_settlement_summary(uuid),public.preview_kinnso_review_bulk(uuid[]),public.run_kinnso_review_bulk(uuid,text,text,text,uuid) from public,anon,authenticated,service_role;
grant execute on function public.get_kinnso_review_queue(jsonb,jsonb,integer),public.get_kinnso_settlement_summary(uuid),public.preview_kinnso_review_bulk(uuid[]),public.run_kinnso_review_bulk(uuid,text,text,text,uuid) to authenticated;
