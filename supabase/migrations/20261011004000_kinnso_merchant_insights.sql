-- P14 read-only aggregate projection. No financial or payment command is added.
create function public.get_kinnso_merchant_insights(p_merchant_id uuid,p_query jsonb default '{}',p_export boolean default false)
returns jsonb language plpgsql security definer set search_path='' as $$
declare actor uuid:=kinnso_internal.actor();as_of timestamptz:=statement_timestamp();from_day date;to_day date;from_time timestamptz;to_time timestamptz;campaign uuid;after_text text;binding text;anchor jsonb;anchor_id uuid;anchor_created timestamptz;result jsonb;last_row jsonb;cursor text;maximum integer;
begin
 perform 1 from auth.users where id=actor and deleted_at is null and (banned_until is null or banned_until<=as_of) for share;
 if not found then raise exception 'unauthenticated';end if;
 perform kinnso_internal.merchant_role(p_merchant_id,actor,null,array['owner']);
 perform kinnso_internal.keys(p_query,array['from','to','campaignId','after']);
 if jsonb_typeof(p_query) is distinct from 'object' or p_export is null then raise exception 'invalid_query';end if;
 if (p_query?'from')<>(p_query?'to') then raise exception 'invalid_range';end if;
 begin
  if p_query?'from' then
   if jsonb_typeof(p_query->'from') is distinct from 'string' or jsonb_typeof(p_query->'to') is distinct from 'string' or (p_query->>'from')!~ '^\d{4}-\d{2}-\d{2}$' or (p_query->>'to')!~ '^\d{4}-\d{2}-\d{2}$' then raise exception 'invalid_range';end if;
   from_day:=(p_query->>'from')::date;to_day:=(p_query->>'to')::date;
   if to_char(from_day,'YYYY-MM-DD')<>p_query->>'from' or to_char(to_day,'YYYY-MM-DD')<>p_query->>'to' then raise exception 'invalid_range';end if;
  else from_day:=(as_of at time zone 'UTC')::date-30;to_day:=(as_of at time zone 'UTC')::date+1;end if;
 exception when others then raise exception 'invalid_range';end;
 if to_day<=from_day or to_day-from_day>366 then raise exception 'invalid_range';end if;
 from_time:=from_day::timestamp at time zone 'UTC';to_time:=to_day::timestamp at time zone 'UTC';
 if p_query?'campaignId' then
  begin if jsonb_typeof(p_query->'campaignId') is distinct from 'string' or (p_query->>'campaignId')!~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' then raise exception 'invalid_query';end if;campaign:=(p_query->>'campaignId')::uuid;exception when others then raise exception 'invalid_query';end;
  perform 1 from public.missions where id=campaign and merchant_profile_id=p_merchant_id;
  if not found then raise exception 'mission_not_found';end if;
 end if;
 after_text:=p_query->>'after';binding:=kinnso_internal.request_digest(jsonb_build_array('merchant_insights_v1',actor,p_merchant_id,from_day,to_day,campaign)::text);
 if p_query?'after' then
  if p_export or jsonb_typeof(p_query->'after') is distinct from 'string' or length(after_text)>1500 or after_text!~ '^v1\.[A-Za-z0-9_-]+$' then raise exception 'invalid_cursor';end if;
  begin anchor:=convert_from(decode(translate(substr(after_text,4),'-_','+/')||repeat('=',(4-length(substr(after_text,4))%4)%4),'base64'),'UTF8')::jsonb;anchor_id:=(anchor->>'id')::uuid;exception when others then raise exception 'invalid_cursor';end;
  if anchor->>'binding' is distinct from binding or anchor->>'v' is distinct from '1' then raise exception 'invalid_cursor';end if;
  select created_at into anchor_created from public.missions where id=anchor_id and merchant_profile_id=p_merchant_id and (campaign is null or id=campaign) and created_at>=from_time and created_at<to_time and created_at<=as_of;
  if not found or anchor->>'createdAt' is distinct from to_jsonb(anchor_created)#>>'{}' then raise exception 'invalid_cursor';end if;
 end if;
 if p_export then
  select count(*) into maximum from (select 1 from public.missions where merchant_profile_id=p_merchant_id and (campaign is null or id=campaign) and created_at>=from_time and created_at<to_time and created_at<=as_of limit 5001)m;
  if maximum>5000 then raise exception 'invalid_export_limit';end if;
 end if;
 maximum:=case when p_export then 5001 else 21 end;
 with campaigns as materialized(
  select id,title,status,created_at from public.missions where merchant_profile_id=p_merchant_id and (campaign is null or id=campaign) and created_at>=from_time and created_at<to_time and created_at<=as_of
 ),participant_stats as(
  select p.mission_id,count(*) participants,count(*)filter(where p.status='invited')invited,count(*)filter(where p.status='active')active,count(*)filter(where p.status='applied')applied,
   count(*)filter(where p.source='merchant_invite' and p.created_at>=from_time and p.created_at<to_time and p.created_at<=as_of)issued,
   count(*)filter(where p.source='merchant_invite' and p.created_at>=from_time and p.created_at<to_time and p.created_at<=as_of and p.approved_at is not null and p.approved_at<=as_of)accepted,
   count(*)filter(where p.source='merchant_invite' and p.created_at>=from_time and p.created_at<to_time and p.created_at<=as_of and p.approved_at is null and p.status in('active','completed','cancelled'))missing_acceptance,
   count(*)filter(where p.source='application' and p.created_at>=from_time and p.created_at<to_time and p.created_at<=as_of)applications
  from public.mission_participants p join campaigns c on c.id=p.mission_id group by p.mission_id
 ),submission_stats as(
  select p.mission_id,count(*)filter(where s.status='submitted')submitted,count(*)filter(where s.status='approved')approved,count(*)filter(where s.status='revision_requested')revision_requested
  from public.mission_milestone_submissions s join public.mission_participants p on p.id=s.mission_participant_id join campaigns c on c.id=p.mission_id group by p.mission_id
 ),review_stats as(
  select p.mission_id,count(*)filter(where r.action='approve')approval_actions from public.mission_review_events r join public.mission_milestone_submissions s on s.id=r.submission_id join public.mission_participants p on p.id=s.mission_participant_id join campaigns c on c.id=p.mission_id
  where r.created_at>=from_time and r.created_at<to_time and r.created_at<=as_of group by p.mission_id
 ),stats as materialized(
  select c.*,coalesce(p.participants,0)participants,coalesce(p.invited,0)invited,coalesce(p.active,0)active,coalesce(p.applied,0)applied,coalesce(s.submitted,0)submitted,coalesce(s.approved,0)approved,coalesce(s.revision_requested,0)revision_requested,
   coalesce(p.issued,0)issued,coalesce(p.accepted,0)accepted,coalesce(p.missing_acceptance,0)missing_acceptance,coalesce(p.applications,0)applications,coalesce(r.approval_actions,0)approval_actions
  from campaigns c left join participant_stats p on p.mission_id=c.id left join submission_stats s on s.mission_id=c.id left join review_stats r on r.mission_id=c.id
 ),bounded as(
  select *,row_number()over(order by created_at desc,id desc)n from stats where anchor_id is null or(created_at,id)<(anchor_created,anchor_id)order by created_at desc,id desc limit maximum
 ),page as(
  select coalesce(jsonb_agg(jsonb_build_object('id',id,'title',title,'status',status,'snapshot',jsonb_build_object('participants',participants,'invited',invited,'active',active,'applied',applied,'submitted',submitted,'approved',approved,'revisionRequested',revision_requested),'invitationCohort',jsonb_build_object('issued',issued,'accepted',case when missing_acceptance>0 then null else accepted end),'periodEvents',jsonb_build_object('applications',applications,'submissions',null,'approvalActions',approval_actions,'redemptions',null,'attribution',null))order by n)filter(where p_export or n<=20),'[]')items,
   case when not p_export and count(*)>20 then(jsonb_agg(jsonb_build_object('id',id,'createdAt',created_at)order by n)->19)else null end last from bounded
 ),totals as(
  select jsonb_build_object('snapshot',jsonb_build_object('campaigns',count(*),'participants',coalesce(sum(participants),0),'invited',coalesce(sum(invited),0),'active',coalesce(sum(active),0),'applied',coalesce(sum(applied),0),'submitted',coalesce(sum(submitted),0),'approved',coalesce(sum(approved),0),'revisionRequested',coalesce(sum(revision_requested),0)),
   'invitationCohort',jsonb_build_object('issued',coalesce(sum(issued),0),'accepted',case when coalesce(sum(missing_acceptance),0)>0 then null else coalesce(sum(accepted),0)end),
   'periodEvents',jsonb_build_object('applications',coalesce(sum(applications),0),'submissions',null,'approvalActions',coalesce(sum(approval_actions),0),'redemptions',null,'attribution',null))counts,
   case when coalesce(sum(missing_acceptance),0)>0 then 'unknown_missing_timestamp' else 'recorded' end acceptance from stats
 )select jsonb_build_object('asOf',as_of,'range',jsonb_build_object('from',from_day,'to',to_day),'counts',totals.counts,'perCampaign',page.items,'nextCursor',null,
  'coverage',jsonb_build_object('campaignSelection','created_in_range','acceptance',totals.acceptance,'submissions','unknown_complete_event_history','redemptions','unknown_campaign_attribution')),page.last into result,last_row from page cross join totals;
 if last_row is not null then cursor:='v1.'||rtrim(translate(replace(encode(convert_to((last_row||jsonb_build_object('v',1,'binding',binding))::text,'UTF8'),'base64'),E'\n',''),'+/','-_'),'=');end if;
 return result||jsonb_build_object('nextCursor',cursor);
end $$;
revoke all on function public.get_kinnso_merchant_insights(uuid,jsonb,boolean)from public,anon,authenticated,service_role;
grant execute on function public.get_kinnso_merchant_insights(uuid,jsonb,boolean)to authenticated;
