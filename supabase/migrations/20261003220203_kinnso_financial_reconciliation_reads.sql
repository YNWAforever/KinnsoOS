-- K21 candidate: read mature financial facts, never mint/reprice/refund/pay them.
-- Branch-less facts cannot be attributed to a finance member's assigned branch.
create function kinnso_internal.finance_minor(p_amount numeric,p_currency text) returns numeric
language sql immutable set search_path='' as $$
 select case when p_currency in ('HKD','USD') and p_amount>=0 and p_amount::text not in ('NaN','Infinity','-Infinity') and p_amount*100=trunc(p_amount*100) then p_amount*100 end
$$;
revoke all on function kinnso_internal.finance_minor(numeric,text) from public,anon,authenticated,service_role;

create table kinnso_internal.reconciliation_cases(
 id uuid primary key default gen_random_uuid(),
 settlement_id uuid unique references public.mission_settlements(id),
 submission_id uuid unique references public.mission_milestone_submissions(id),
 created_by uuid not null references auth.users(id),
 owner_id uuid references auth.users(id),
 status text not null default 'open' check(status in ('open','investigating','waiting_business_rules','closed')),
 revision integer not null default 1 check(revision>0),
 created_at timestamptz not null default now(),
 check(num_nonnulls(settlement_id,submission_id)=1)
);
create table kinnso_internal.reconciliation_history(
 id uuid primary key default gen_random_uuid(),case_id uuid not null references kinnso_internal.reconciliation_cases(id),
 actor_id uuid not null references auth.users(id),owner_id uuid references auth.users(id),
 status text not null check(status in ('open','investigating','waiting_business_rules','closed')),
 revision integer not null,reason text not null check(length(btrim(reason)) between 10 and 2000),created_at timestamptz not null default now(),
 unique(case_id,revision)
);
alter table kinnso_internal.reconciliation_cases enable row level security;
alter table kinnso_internal.reconciliation_history enable row level security;
revoke all on kinnso_internal.reconciliation_cases,kinnso_internal.reconciliation_history from public,anon,authenticated,service_role;
create function kinnso_internal.reconciliation_history_immutable() returns trigger language plpgsql set search_path='' as $$
begin raise exception 'immutable_history';end $$;
revoke all on function kinnso_internal.reconciliation_history_immutable() from public,anon,authenticated,service_role;
create trigger reconciliation_history_immutable before update or delete on kinnso_internal.reconciliation_history for each row execute function kinnso_internal.reconciliation_history_immutable();

-- Receipt linkage is optional on preserved older financial schemas. Missing linkage
-- stays unknown; never add a financial FK or infer approval from the missing field.
-- One row per economic fact. Claimed/receipt predecessors disappear from this read
-- model once a linked settlement exists; their source IDs remain in proof references.
-- Batches carry NO settlement allocation in the mature schema and stay a separate basis.
create function kinnso_internal.finance_rows(p_merchant uuid,p_branches uuid[],p_owner boolean,p_ops boolean)
returns table(key text,kind text,source_id uuid,merchant_id uuid,mission_id uuid,branch_id uuid,title text,state text,source_status text,currency text,recorded_amount numeric,minor_amount numeric,basis text,proof jsonb,exceptions text[],refs jsonb,updated_at timestamptz)
language sql stable security definer set search_path='' as $$
 with obligations as (
 select s.*,nullif(pg_catalog.to_jsonb(s)->>'mission_milestone_submission_id','')::uuid contract_submission_id,m.merchant_profile_id,m.title,p.creator_id,r.id redemption_id,r.offer_claim_id,r.kinnso_branch_id,
 sub.status receipt_status,e.event_state,
 case when s.creator_commission_amount is null and s.paid_fee_amount is null then null else coalesce(s.creator_commission_amount,0)+coalesce(s.paid_fee_amount,0) end amount,
 (r.id is not null or sub.status='approved' or e.event_state='paid' or
  (s.source='mission_fee' and s.affiliate_network_event_id is null and exists(select 1 from public.mission_milestone_submissions approved where approved.mission_participant_id=s.mission_participant_id and approved.status='approved'))) is true validated
 from public.mission_settlements s join public.missions m on m.id=s.mission_id
 left join public.mission_participants p on p.id=s.mission_participant_id
 left join public.mission_milestone_submissions sub on sub.id=nullif(pg_catalog.to_jsonb(s)->>'mission_milestone_submission_id','')::uuid
 left join public.affiliate_network_events e on e.id=s.affiliate_network_event_id
 left join lateral(select red.* from public.offer_redemptions red where red.settlement_id=s.id and red.merchant_profile_id=m.merchant_profile_id order by red.id limit 1)r on true
 where (p_ops or m.merchant_profile_id=p_merchant) and (p_ops or p_owner or r.kinnso_branch_id=any(p_branches))
 ), qualified as (
 select *,validated and creator_id is not null and amount>0 and status<>'disputed' and kinnso_internal.finance_minor(amount,amount_currency) is not null eligible from obligations
 )
 select 'settlement:'||q.id,'settlement',q.id,q.merchant_profile_id,q.mission_id,q.kinnso_branch_id,q.title,
 case when q.creator_payout_status='paid' then 'paid' when q.status in ('paid','partially_paid') then 'settled' when q.eligible then 'eligible' when q.validated then 'validated' when q.redemption_id is not null then 'redeemed' else 'recorded' end,
 q.status,q.amount_currency,q.amount,kinnso_internal.finance_minor(q.amount,q.amount_currency),'creator_obligation',
 jsonb_build_object('claimed',q.offer_claim_id is not null,'redeemed',q.redemption_id is not null,'validated',q.validated,'eligible',coalesce(q.eligible,false),'settled',q.status in ('paid','partially_paid'),'paid',q.creator_payout_status='paid' is true),
 array_remove(array[case when q.status='disputed' then 'disputed' end,case when q.creator_id is null then 'missing_creator_attribution' end,
 case when not q.validated then 'validation_proof_missing' end,case when q.creator_payout_status is null then 'payout_leg_unknown' end,
 case when q.event_state in ('cancelled','unknown') then 'affiliate_'||q.event_state end,case when q.source='receipt_cashback' and q.receipt_status is null then 'receipt_approval_unverified' when q.source='receipt_cashback' and q.receipt_status<>'approved' then 'receipt_not_approved' end,case when q.source='receipt_cashback' and q.contract_submission_id is null then 'receipt_linkage_unknown' end],null),
 jsonb_build_object('claimId',q.offer_claim_id,'redemptionId',q.redemption_id,'submissionId',q.contract_submission_id,'settlementId',q.id),q.updated_at from qualified q
 union all
 select 'claim:'||c.id,'claim',c.id,o.merchant_profile_id,o.mission_id,r.kinnso_branch_id,o.title,case when r.id is not null then 'redeemed' else 'claimed' end,c.status,null::text,null::numeric,null::numeric,'attribution',
 jsonb_build_object('claimed',true,'redeemed',r.id is not null,'validated',r.id is not null,'eligible',false,'settled',false,'paid',false),
 array_remove(array[case when c.status='expired' or (r.id is null and c.expires_at<now()) then 'expired_claim' end,case when r.id is not null then 'no_minted_obligation' end],null),
 jsonb_build_object('claimId',c.id,'redemptionId',r.id),coalesce(r.redeemed_at,c.created_at)
 from public.offer_claims c join public.merchant_offers o on o.id=c.offer_id left join public.offer_redemptions r on r.offer_claim_id=c.id
 where (p_ops or o.merchant_profile_id=p_merchant) and (p_ops or p_owner or r.kinnso_branch_id=any(p_branches)) and not exists(select 1 from public.mission_settlements s where s.id=r.settlement_id)
 union all
 select 'receipt:'||sub.id,'receipt',sub.id,m.merchant_profile_id,m.id,null::uuid,m.title,case when sub.status='approved' then 'validated' else 'recorded' end,sub.status,null::text,null::numeric,null::numeric,'attribution',
 jsonb_build_object('claimed',false,'redeemed',false,'validated',sub.status='approved','eligible',false,'settled',false,'paid',false),
 array_remove(array[case when sub.status in ('rejected','revision_requested') then 'receipt_'||sub.status end,case when sub.status='approved' then 'no_linked_obligation' end],null),
 jsonb_build_object('submissionId',sub.id),sub.updated_at
 from public.mission_milestone_submissions sub join public.mission_participants p on p.id=sub.mission_participant_id join public.missions m on m.id=p.mission_id
 where m.mission_type='receipt_cashback' and (p_ops or (p_owner and m.merchant_profile_id=p_merchant))
 and not exists(select 1 from public.mission_settlements s where nullif(pg_catalog.to_jsonb(s)->>'mission_milestone_submission_id','')::uuid=sub.id)
 union all
 select 'payout_batch:'||b.id,'payout_batch',b.id,null::uuid,null::uuid,null::uuid,'Creator payout promise',case when b.status='paid' then 'paid' else 'recorded' end,b.status,b.currency,b.amount,kinnso_internal.finance_minor(b.amount,b.currency),'payout_promise',
 jsonb_build_object('claimed',false,'redeemed',false,'validated',false,'eligible',false,'settled',false,'paid',b.status='paid'),array['not_allocated_to_settlements'],jsonb_build_object(),b.updated_at
 from public.creator_payout_batches b where p_ops
 union all
 select 'booking_settlement:'||s.id,'booking_settlement',s.id,null::uuid,null::uuid,null::uuid,'Historical booking merchant obligation',
 case when s.merchant_payout_status='paid' then 'paid' when s.status in ('paid','partially_paid') then 'settled' else 'recorded' end,s.status,s.currency,s.merchant_payout_amount,kinnso_internal.finance_minor(s.merchant_payout_amount,s.currency),'merchant_booking_obligation',
 jsonb_build_object('claimed',false,'redeemed',false,'validated',false,'eligible',false,'settled',s.status in ('paid','partially_paid'),'paid',s.merchant_payout_status='paid'),
 array_remove(array[case when s.status='disputed' then 'disputed' end],null),jsonb_build_object('bookingId',s.booking_id),s.updated_at
 from public.booking_settlements s where p_ops
$$;
revoke all on function kinnso_internal.finance_rows(uuid,uuid[],boolean,boolean) from public,anon,authenticated,service_role;

create function public.get_kinnso_reconciliation(p_filter jsonb default '{}',p_cursor jsonb default null) returns jsonb
language plpgsql security definer set search_path='' as $$
declare a uuid:=kinnso_internal.actor();merchant uuid;branches uuid[];role_name text;is_ops boolean;is_owner boolean:=false;scope_hash text;rows jsonb;totals jsonb;cursor jsonb;
begin
 perform kinnso_internal.keys(p_filter,array['merchantId','missionId','state','exceptionsOnly']);
 if jsonb_typeof(p_filter) is distinct from 'object' or (p_filter ? 'exceptionsOnly' and jsonb_typeof(p_filter->'exceptionsOnly') is distinct from 'boolean') or (p_filter ? 'state' and (p_filter->>'state' is null or p_filter->>'state' not in ('claimed','redeemed','validated','eligible','settled','paid','recorded'))) then raise exception 'invalid_filter';end if;
 merchant:=(p_filter->>'merchantId')::uuid;is_ops:=merchant is null;
 if is_ops then
  select role into role_name from public.kinnso_ops_members where user_id=a and status='active' and role in ('owner','admin','moderator','analyst') for share;
  if not found then raise exception 'forbidden';end if;
 else
  role_name:=kinnso_internal.merchant_role(merchant,a,null,array['owner','finance']);is_owner:=role_name='owner';
  select coalesce(array_agg(b.id order by b.id),'{}') into branches from kinnso_internal.merchant_branches b
   left join kinnso_internal.merchant_members member on member.merchant_id=merchant and member.user_id=a and member.active
   where b.merchant_id=merchant and b.active and (is_owner or b.id=any(member.branch_ids));
 end if;
 scope_hash:=kinnso_internal.request_digest(jsonb_build_array(a,p_filter,role_name,branches)::text);
 if p_cursor is not null then
  perform kinnso_internal.keys(p_cursor,array['key','scope']);
  if jsonb_typeof(p_cursor) is distinct from 'object' or p_cursor->>'scope' is distinct from scope_hash or p_cursor->>'key' is null or length(p_cursor->>'key')>100 then raise exception 'invalid_cursor';end if;
 end if;
 with facts as materialized(
  select f.*,case when currency is null then 'currency_unknown' when currency not in ('HKD','USD') then 'currency_conversion_blocked' when recorded_amount is not null and minor_amount is null then 'amount_precision_invalid' when recorded_amount is null and basis<>'attribution' then 'amount_unknown' end amount_issue
  from kinnso_internal.finance_rows(merchant,branches,is_owner,is_ops) f
  where (p_filter->>'missionId' is null or f.mission_id=(p_filter->>'missionId')::uuid) and (p_filter->>'state' is null or f.state=p_filter->>'state')
 ), filtered as materialized(select * from facts where not coalesce((p_filter->>'exceptionsOnly')::boolean,false) or cardinality(exceptions)>0 or (basis<>'attribution' and amount_issue is not null)),
 page as(select *,row_number()over(order by key)n from (select * from filtered where p_cursor is null or key>p_cursor->>'key' order by key limit 51)x),
 buckets as(select currency,basis,state,count(*) n,count(*)filter(where minor_amount is null and basis<>'attribution')blocked,
  case when count(*)filter(where minor_amount is null and basis<>'attribution')>0 then null else sum(minor_amount) end minor from filtered group by currency,basis,state)
 select
  coalesce((select jsonb_agg(jsonb_build_object('key',p.key,'kind',p.kind,'sourceId',p.source_id,'merchantId',p.merchant_id,'missionId',p.mission_id,'branchId',p.branch_id,'title',p.title,'state',p.state,'sourceStatus',p.source_status,'currency',p.currency,'recordedAmount',p.recorded_amount::text,'minorAmount',trunc(p.minor_amount)::text,'amountIssue',case when p.basis='attribution' then null else p.amount_issue end,'basis',p.basis,'proof',p.proof,'exceptions',p.exceptions,'references',p.refs,'updatedAt',p.updated_at,
   'review',(select jsonb_build_object('id',c.id,'status',c.status,'ownerId',c.owner_id,'revision',c.revision,'historyCount',c.revision,'history',coalesce((select jsonb_agg(jsonb_build_object('id',h.id,'status',h.status,'ownerId',h.owner_id,'reason',h.reason,'createdAt',h.created_at)order by h.revision)from (select * from kinnso_internal.reconciliation_history h0 where h0.case_id=c.id order by h0.revision desc limit 20)h),'[]')) from kinnso_internal.reconciliation_cases c where (c.settlement_id=p.source_id and p.kind='settlement') or (c.submission_id=coalesce((p.refs->>'submissionId')::uuid,p.source_id) and p.kind in ('receipt','settlement')) order by (c.submission_id=coalesce((p.refs->>'submissionId')::uuid,p.source_id)) desc nulls last,c.id limit 1))order by p.key) from page p where n<=50),'[]'),
  (select jsonb_build_object('key',key,'scope',scope_hash)from page where n=50 and exists(select 1 from page where n=51)),
  coalesce((select jsonb_agg(jsonb_build_object('currency',currency,'basis',basis,'state',state,'count',n,'minorAmount',trunc(minor)::text,'blockedAmountCount',blocked)order by currency nulls first,basis,state)from buckets),'[]')
 into rows,cursor,totals;
 return jsonb_build_object('items',rows,'nextCursor',cursor,'totals',totals,'scope',jsonb_build_object('mode',case when is_ops then 'ops' else 'merchant' end,'merchantId',merchant,'role',role_name,'branchIds',coalesce(to_jsonb(branches),'[]')),
 'capabilities',jsonb_build_object('livePayment',false,'refund',false,'feeAdjustment',false,'disputeMoneyResolution',false));
end $$;
revoke all on function public.get_kinnso_reconciliation(jsonb,jsonb) from public,anon,authenticated,service_role;
grant execute on function public.get_kinnso_reconciliation(jsonb,jsonb) to authenticated;

-- Operational review only: closed means review finished, never financially resolved.
-- A real settlement/submission FK is required; no arbitrary entity refs or money writes.
create function public.apply_kinnso_reconciliation_review(p_request_id uuid,p_command jsonb) returns jsonb
language plpgsql security definer set search_path='' as $$
declare a uuid:=kinnso_internal.actor();ops boolean;role_name text;v_id uuid;v_source uuid;v_submission uuid;merchant uuid;branch uuid;source_kind text;case_row kinnso_internal.reconciliation_cases;prior kinnso_internal.workspace_requests;digest text;result jsonb;next_status text;
begin
 perform kinnso_internal.keys(p_command,array['type','sourceKey','id','expectedRevision','status','reason']);
 if p_request_id is null or jsonb_typeof(p_command) is distinct from 'object' or length(btrim(coalesce(p_command->>'reason',''))) not between 10 and 2000 then raise exception 'invalid_command';end if;
 select role into role_name from public.kinnso_ops_members where user_id=a and status='active' and role in ('owner','admin','moderator') for share;ops:=found;
 if p_command->>'type'='open' then
  source_kind:=split_part(p_command->>'sourceKey',':',1);v_source:=split_part(p_command->>'sourceKey',':',2)::uuid;
  if source_kind='settlement' then
   select m.merchant_profile_id,r.kinnso_branch_id,nullif(pg_catalog.to_jsonb(s)->>'mission_milestone_submission_id','')::uuid into merchant,branch,v_submission from public.mission_settlements s join public.missions m on m.id=s.mission_id left join lateral(select red.kinnso_branch_id from public.offer_redemptions red where red.settlement_id=s.id and red.merchant_profile_id=m.merchant_profile_id order by red.id limit 1)r on true where s.id=v_source for share of s,m;
  elsif source_kind='receipt' then
   select m.merchant_profile_id,s.id into merchant,v_submission from public.mission_milestone_submissions s join public.mission_participants p on p.id=s.mission_participant_id join public.missions m on m.id=p.mission_id where s.id=v_source and m.mission_type='receipt_cashback' for share of s,m;
  else raise exception 'invalid_source';end if;
  if not found then raise exception 'invalid_source';end if;
  if not ops then
   role_name:=kinnso_internal.merchant_role(merchant,a,null,array['owner','finance']);
   if role_name<>'owner' then if branch is null then raise exception 'forbidden';end if;perform kinnso_internal.merchant_role(merchant,a,branch,array['finance']);end if;
  end if;
 elsif p_command->>'type'='review' then
  if not ops then raise exception 'forbidden';end if;
  v_id:=(p_command->>'id')::uuid;select * into case_row from kinnso_internal.reconciliation_cases where id=v_id for update;
  if not found then raise exception 'invalid_source';end if;
 else raise exception 'invalid_command';end if;
 -- Reauthorize source/role before replay; revoked actors cannot retrieve old replies.
 perform pg_advisory_xact_lock(hashtextextended(a::text||p_request_id::text,0));
 digest:=kinnso_internal.request_digest(jsonb_build_array('reconciliation',p_command)::text);
 select * into prior from kinnso_internal.workspace_requests where actor_id=a and request_id=p_request_id;
 if found then if prior.digest<>digest then raise exception 'idempotency_conflict';end if;return prior.result;end if;
 if p_command->>'type'='open' then
  perform pg_advisory_xact_lock(hashtextextended('reconciliation:'||case when v_submission is not null then 'receipt:'||v_submission::text else source_kind||':'||v_source::text end,0));
  select * into case_row from kinnso_internal.reconciliation_cases where (settlement_id=v_source and source_kind='settlement') or (submission_id=v_submission and v_submission is not null) order by (submission_id=v_submission) desc nulls last,id limit 1 for update;
  if not found then
   insert into kinnso_internal.reconciliation_cases(settlement_id,submission_id,created_by) values(case when v_submission is null then v_source end,v_submission,a) returning * into case_row;
   insert into kinnso_internal.reconciliation_history(case_id,actor_id,owner_id,status,revision,reason)values(case_row.id,a,null,'open',1,btrim(p_command->>'reason'));
  end if;
 else
  if case_row.revision is distinct from (p_command->>'expectedRevision')::integer then raise exception 'revision_conflict';end if;
  next_status:=p_command->>'status';if next_status is null or next_status not in ('open','investigating','waiting_business_rules','closed') then raise exception 'invalid_command';end if;
  update kinnso_internal.reconciliation_cases set owner_id=a,status=next_status,revision=revision+1 where id=case_row.id returning * into case_row;
  insert into kinnso_internal.reconciliation_history(case_id,actor_id,owner_id,status,revision,reason)values(case_row.id,a,a,case_row.status,case_row.revision,btrim(p_command->>'reason'));
 end if;
 result:=jsonb_build_object('id',case_row.id,'revision',case_row.revision);
 insert into kinnso_internal.workspace_requests values(a,p_request_id,digest,result,now());return result;
end $$;
revoke all on function public.apply_kinnso_reconciliation_review(uuid,jsonb) from public,anon,authenticated,service_role;
grant execute on function public.apply_kinnso_reconciliation_review(uuid,jsonb) to authenticated;
