-- Organization roles remain separate from mature ops/creator enums.
-- The workspace persists authored brief content on the mature mission model.
-- Install only its two absent content fields; preserve compatible definitions
-- and all existing content, and refuse incompatible manual schema changes.
do $content_prerequisite$
declare field text; actual record;
begin
 if not exists(select 1 from pg_catalog.pg_class where oid=pg_catalog.to_regclass('public.missions') and relkind='r') then
  raise exception 'merchant_content_prerequisite_incompatible';
 end if;
 foreach field in array array['requirements','deliverables'] loop
  select a.atttypid,a.attnotnull into actual from pg_catalog.pg_attribute a
   where a.attrelid=pg_catalog.to_regclass('public.missions') and a.attname=field and a.attnum>0 and not a.attisdropped;
  if not found then
   execute pg_catalog.format('alter table public.missions add column %I text[] not null default %L',field,'{}');
  elsif actual.atttypid<>'text[]'::pg_catalog.regtype or not actual.attnotnull then
   raise exception 'merchant_content_prerequisite_incompatible';
  end if;
 end loop;
end $content_prerequisite$;

create table kinnso_internal.merchant_branches(id uuid primary key,merchant_id uuid not null references public.merchant_profiles(id) on delete cascade,name text not null check(length(btrim(name)) between 1 and 120),active boolean not null default true,created_at timestamptz not null default now());
create table kinnso_internal.merchant_members(merchant_id uuid not null references public.merchant_profiles(id) on delete cascade,user_id uuid not null references auth.users(id) on delete cascade,role text not null check(role in ('marketing','clerk','finance')),branch_ids uuid[] not null,active boolean not null default true,updated_at timestamptz not null default now(),primary key(merchant_id,user_id));
create table kinnso_internal.workspace_requests(actor_id uuid not null references auth.users(id) on delete cascade,request_id uuid not null,digest text not null,result jsonb not null,created_at timestamptz not null default now(),primary key(actor_id,request_id));
create table kinnso_internal.merchant_audit(id uuid primary key default gen_random_uuid(),merchant_id uuid not null references public.merchant_profiles(id) on delete cascade,actor_id uuid not null,action text not null,entity_id uuid not null,reason text not null,created_at timestamptz not null default now());
alter table kinnso_internal.merchant_branches enable row level security;alter table kinnso_internal.merchant_members enable row level security;alter table kinnso_internal.workspace_requests enable row level security;alter table kinnso_internal.merchant_audit enable row level security;
revoke all on kinnso_internal.merchant_branches,kinnso_internal.merchant_members,kinnso_internal.workspace_requests,kinnso_internal.merchant_audit from public,anon,authenticated,service_role;
alter table public.offer_redemptions add column kinnso_branch_id uuid references kinnso_internal.merchant_branches(id);
create function kinnso_internal.merchant_role(p_merchant uuid,p_actor uuid,p_branch uuid,p_roles text[]) returns text language plpgsql security definer set search_path='' as $$
declare v_profile public.merchant_profiles;v_member kinnso_internal.merchant_members;v_role text;begin
 select * into v_profile from public.merchant_profiles where id=p_merchant and status='active' for share;
 if not found then raise exception 'forbidden';end if;
 if v_profile.user_id=p_actor then v_role:='owner';else
  select * into v_member from kinnso_internal.merchant_members where merchant_id=p_merchant and user_id=p_actor and active for share;
  if not found or v_member.role<>all(p_roles) then raise exception 'forbidden';end if;v_role:=v_member.role;
 end if;
 if p_branch is not null then
  perform 1 from kinnso_internal.merchant_branches where id=p_branch and merchant_id=p_merchant and active for share;
  if not found or (v_role<>'owner' and not p_branch=any(v_member.branch_ids)) then raise exception 'forbidden';end if;
 end if;return v_role;
end $$;
revoke all on function kinnso_internal.merchant_role(uuid,uuid,uuid,text[]) from public,anon,authenticated,service_role;
create function public.get_kinnso_merchant_memberships() returns jsonb language plpgsql stable security definer set search_path='' as $$
declare v_actor uuid:=kinnso_internal.actor();begin
 return coalesce((select jsonb_agg(jsonb_build_object('merchantId',m.id,'name',m.company_name,'role',case when m.user_id=v_actor then 'owner' else member.role end,
  'branchIds',coalesce((select jsonb_agg(b.id order by b.id) from kinnso_internal.merchant_branches b where b.merchant_id=m.id and b.active and (m.user_id=v_actor or b.id=any(member.branch_ids))),'[]')) order by m.id)
  from public.merchant_profiles m left join kinnso_internal.merchant_members member on member.merchant_id=m.id and member.user_id=v_actor and member.active where m.status='active' and (m.user_id=v_actor or member.user_id is not null)),'[]');
end $$;
create or replace function public.kinnso_actor() returns jsonb language plpgsql security definer set search_path='' as $$
declare v_actor uuid:=kinnso_internal.actor();v_roles text[]:=array['traveller'];v_merchants jsonb;begin
 if exists(select 1 from public.creators where id=v_actor and status='active') then v_roles:=array_append(v_roles,'creator');end if;
 if exists(select 1 from public.kinnso_ops_members where user_id=v_actor and status='active') then v_roles:=array_append(v_roles,'ops');end if;
 select coalesce(jsonb_agg(id order by id),'[]') into v_merchants from public.merchant_profiles m where status='active' and (user_id=v_actor or exists(select 1 from kinnso_internal.merchant_members s where s.merchant_id=m.id and s.user_id=v_actor and s.active));
 if jsonb_array_length(v_merchants)>0 then v_roles:=array_append(v_roles,'merchant');end if;
 return jsonb_build_object('id',v_actor,'roles',v_roles,'merchantMemberships',v_merchants);
end $$;
create function public.apply_kinnso_merchant_command(p_merchant_id uuid,p_request_id uuid,p_command jsonb) returns jsonb language plpgsql security definer set search_path='' as $$
declare v_actor uuid:=kinnso_internal.actor();v_role text;v_digest text;v_prior kinnso_internal.workspace_requests;v_type text:=p_command->>'type';v_result jsonb;v_id uuid;v_branches uuid[];v_status text;v_mission public.missions;v_participant public.mission_participants;begin
 v_role:=kinnso_internal.merchant_role(p_merchant_id,v_actor,null,case when v_type in ('createBrief','reviewApplication') then array['owner','marketing'] else array['owner'] end);
 if p_request_id is null or octet_length(p_command::text)>65536 then raise exception 'invalid_command';end if;
 perform pg_advisory_xact_lock(hashtextextended(v_actor::text||p_request_id::text,0));
 v_digest:=kinnso_internal.request_digest(jsonb_build_array('merchant',p_merchant_id,p_command)::text);
 select * into v_prior from kinnso_internal.workspace_requests where actor_id=v_actor and request_id=p_request_id;
 if found then if v_prior.digest<>v_digest then raise exception 'idempotency_conflict';end if;return v_prior.result;end if;
 if v_type='createBranch' then
  perform kinnso_internal.keys(p_command,array['type','id','name','reason']);v_id:=(p_command->>'id')::uuid;
  if v_id is null or jsonb_typeof(p_command->'name') is distinct from 'string' then raise exception 'invalid_command';end if;
  insert into kinnso_internal.merchant_branches(id,merchant_id,name) values(v_id,p_merchant_id,p_command->>'name');v_result:=jsonb_build_object('id',v_id,'name',p_command->>'name');
 elsif v_type='setMember' then
  perform kinnso_internal.keys(p_command,array['type','userId','role','branchIds','active','reason']);v_id:=(p_command->>'userId')::uuid;
  if v_id is null or p_command->>'role' is null or p_command->>'role' not in ('marketing','clerk','finance') or jsonb_typeof(p_command->'branchIds') is distinct from 'array' or jsonb_typeof(p_command->'active') is distinct from 'boolean' then raise exception 'invalid_command';end if;
  select coalesce(array_agg(value::uuid),'{}') into v_branches from jsonb_array_elements_text(p_command->'branchIds');
  if cardinality(v_branches)>100 or cardinality(v_branches)<>(select count(distinct x) from unnest(v_branches) x) or exists(select 1 from unnest(v_branches) x where not exists(select 1 from kinnso_internal.merchant_branches where id=x and merchant_id=p_merchant_id and active)) then raise exception 'invalid_branch';end if;
  insert into kinnso_internal.merchant_members(merchant_id,user_id,role,branch_ids,active) values(p_merchant_id,v_id,p_command->>'role',v_branches,(p_command->>'active')::boolean) on conflict(merchant_id,user_id) do update set role=excluded.role,branch_ids=excluded.branch_ids,active=excluded.active,updated_at=now();
  v_result:=jsonb_build_object('userId',v_id,'role',p_command->>'role','branchIds',p_command->'branchIds','active',p_command->'active');
 elsif v_type='createBrief' then
  perform kinnso_internal.keys(p_command,array['type','id','title','summary','couponCode','couponUrl','affiliateRate','kinnsoRate','creatorRate','publish','requirements','deliverables','reason']);v_id:=(p_command->>'id')::uuid;
  if v_id is null or jsonb_typeof(p_command->'title') is distinct from 'string' or length(btrim(p_command->>'title')) not between 1 and 120 or jsonb_typeof(p_command->'summary') is distinct from 'string' or length(btrim(p_command->>'summary')) not between 1 and 5000 or jsonb_typeof(p_command->'couponCode') is distinct from 'string' or coalesce(btrim(p_command->>'couponCode'),'')='' or jsonb_typeof(p_command->'couponUrl') is distinct from 'string' or p_command->>'couponUrl' !~ '^https?://[^[:space:]]+$' or jsonb_typeof(p_command->'publish') is distinct from 'boolean' then raise exception 'invalid_brief';end if;
  if jsonb_typeof(p_command->'affiliateRate') is distinct from 'number' or jsonb_typeof(p_command->'kinnsoRate') is distinct from 'number' or jsonb_typeof(p_command->'creatorRate') is distinct from 'number' or (p_command->>'affiliateRate')::numeric<0 or (p_command->>'kinnsoRate')::numeric<0 or (p_command->>'creatorRate')::numeric<0 then raise exception 'invalid_brief';end if;
  if jsonb_typeof(p_command->'requirements') is distinct from 'array' or jsonb_typeof(p_command->'deliverables') is distinct from 'array' or exists(select 1 from jsonb_array_elements((p_command->'requirements')||(p_command->'deliverables')) value where jsonb_typeof(value)<>'string' or length(value#>>'{}')>1000) then raise exception 'invalid_brief';end if;
  insert into public.missions(id,merchant_profile_id,title,summary,mission_type,mission_source,visibility,status,published_at,coupon_code,coupon_url,affiliate_commission_rate,kinnso_commission_rate,creator_commission_rate,requirements,deliverables)
  values(v_id,p_merchant_id,p_command->>'title',p_command->>'summary','coupon_affiliate','merchant','open',case when (p_command->>'publish')::boolean then 'published' else 'draft' end,case when (p_command->>'publish')::boolean then now() else null end,p_command->>'couponCode',p_command->>'couponUrl',(p_command->>'affiliateRate')::numeric,(p_command->>'kinnsoRate')::numeric,(p_command->>'creatorRate')::numeric,array(select jsonb_array_elements_text(p_command->'requirements')),array(select jsonb_array_elements_text(p_command->'deliverables')));
  v_result:=jsonb_build_object('id',v_id,'status',case when (p_command->>'publish')::boolean then 'published' else 'draft' end);
 elsif v_type='reviewApplication' then
  perform kinnso_internal.keys(p_command,array['type','id','expectedStatus','action','note','reason']);v_id:=(p_command->>'id')::uuid;
  select * into v_participant from public.mission_participants where id=v_id for update;
  select * into v_mission from public.missions where id=v_participant.mission_id and merchant_profile_id=p_merchant_id;
  if not found then raise exception 'forbidden';end if;
  if p_command->>'action' is null or p_command->>'action' not in ('approve','reject') or v_participant.status is distinct from p_command->>'expectedStatus' or v_participant.status not in ('applied','invited') then raise exception 'revision_conflict';end if;
  v_status:=case p_command->>'action' when 'approve' then 'active' else 'rejected' end;
  update public.mission_participants set status=v_status,merchant_review_note=p_command->>'note',approved_at=case when v_status='active' then now() else null end where id=v_id;
  v_result:=jsonb_build_object('id',v_id,'status',v_status);
 else raise exception 'invalid_command';end if;
 insert into kinnso_internal.merchant_audit(merchant_id,actor_id,action,entity_id,reason) values(p_merchant_id,v_actor,v_type,v_id,coalesce(nullif(btrim(p_command->>'reason'),''),'Explicit merchant command'));
 insert into kinnso_internal.workspace_requests values(v_actor,p_request_id,v_digest,v_result,now());return v_result;
end $$;
create function public.get_kinnso_merchant_workspace(p_merchant_id uuid,p_after uuid default null,p_application_after uuid default null,p_outcome_after uuid default null) returns jsonb language plpgsql security definer set search_path='' as $$
declare v_actor uuid:=kinnso_internal.actor();v_role text;v_missions jsonb;v_cursor uuid;v_applications jsonb;v_application_cursor uuid;v_outcomes jsonb;v_outcome_cursor uuid;v_outcome_time timestamptz;v_branches uuid[];begin
 v_role:=kinnso_internal.merchant_role(p_merchant_id,v_actor,null,array['owner','marketing','clerk','finance']);
 select branch_ids into v_branches from kinnso_internal.merchant_members where merchant_id=p_merchant_id and user_id=v_actor and active;
 select coalesce(jsonb_agg(jsonb_build_object('id',id,'title',title,'summary',summary,'status',status,'missionType',mission_type) order by id) filter(where n<=20),'[]'),case when count(*)>20 then (select id from (select id,row_number()over(order by id)n from public.missions where merchant_profile_id=p_merchant_id and (p_after is null or id>p_after) order by id limit 21)x where n=20) else null end
 into v_missions,v_cursor from(select *,row_number()over(order by id)n from public.missions where merchant_profile_id=p_merchant_id and (p_after is null or id>p_after) order by id limit 21)x;
 with bounded as (select p.*,m.title,row_number()over(order by p.id)n from public.mission_participants p join public.missions m on m.id=p.mission_id where m.merchant_profile_id=p_merchant_id and p.status in ('applied','invited') and (p_application_after is null or p.id>p_application_after) and v_role in ('owner','marketing') order by p.id limit 51)
 select coalesce(jsonb_agg(jsonb_build_object('id',id,'creatorId',creator_id,'missionTitle',title,'status',status,'note',application_note) order by id) filter(where n<=50),'[]'),case when count(*)>50 then (array_agg(id order by id))[50] else null end into v_applications,v_application_cursor from bounded;
 if p_outcome_after is not null then
  select redeemed_at into v_outcome_time from public.offer_redemptions where id=p_outcome_after and merchant_profile_id=p_merchant_id and (v_role='owner' or kinnso_branch_id=any(v_branches));
  if not found then raise exception 'invalid_cursor';end if;
 end if;
 with bounded as (select r.*,row_number()over(order by redeemed_at desc,id desc)n from public.offer_redemptions r where merchant_profile_id=p_merchant_id and (v_role='owner' or kinnso_branch_id=any(v_branches)) and (p_outcome_after is null or (redeemed_at,id)<(v_outcome_time,p_outcome_after)) order by redeemed_at desc,id desc limit 51)
 select coalesce(jsonb_agg(jsonb_build_object('id',r.id,'redeemedAt',r.redeemed_at,'state',case when s.status='paid' then 'paid' when s.id is not null then 'settled' else 'redeemed' end,'currency',s.amount_currency,'creatorAmount',s.creator_commission_amount::text,'branchId',r.kinnso_branch_id) order by r.redeemed_at desc,r.id desc) filter(where n<=50),'[]'),case when count(*)>50 then (array_agg(r.id order by r.redeemed_at desc,r.id desc))[50] else null end into v_outcomes,v_outcome_cursor from bounded r left join public.mission_settlements s on s.id=r.settlement_id;
 return jsonb_build_object('merchantId',p_merchant_id,'role',v_role,'branches',coalesce((select jsonb_agg(jsonb_build_object('id',b.id,'name',b.name) order by b.id) from kinnso_internal.merchant_branches b where merchant_id=p_merchant_id and active and (v_role='owner' or b.id=any(v_branches))),'[]'),
  'missions',case when v_role in ('owner','marketing') then v_missions else '[]'::jsonb end,'nextCursor',case when v_role in ('owner','marketing') then to_jsonb(v_cursor) else null end,
  'applications',v_applications,'applicationsNextCursor',v_application_cursor,'outcomes',v_outcomes,'outcomesNextCursor',v_outcome_cursor,'moneyCapability','historical_records_only');
end $$;
revoke all on function public.get_kinnso_merchant_memberships(),public.apply_kinnso_merchant_command(uuid,uuid,jsonb),public.get_kinnso_merchant_workspace(uuid,uuid,uuid,uuid),public.kinnso_actor() from public,anon,authenticated,service_role;
grant execute on function public.get_kinnso_merchant_memberships(),public.apply_kinnso_merchant_command(uuid,uuid,jsonb),public.get_kinnso_merchant_workspace(uuid,uuid,uuid,uuid),public.kinnso_actor() to authenticated;

-- Reuse the mature atomic redemption, including settlement and consent-aware attribution.
create or replace function kinnso_internal.redeem_offer(
  p_branch_id uuid,
  p_raw_token text,
  p_amount_spent numeric default null
) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  v_staff uuid := kinnso_internal.actor();
  v_token_hash text;
  v_claim record;
  v_offer record;
  v_redemption_id uuid;
  v_existing record;
begin
  if v_staff is null then raise exception 'unauthorized' using errcode = '42501'; end if;
  if coalesce(btrim(p_raw_token), '') = '' then raise exception 'bad_token'; end if;

  v_token_hash := encode(extensions.digest(p_raw_token, 'sha256'), 'hex');

  -- Older installations have neither consent columns nor a collector. Missing
  -- metadata is unconsented; do not install or infer attribution to redeem.
  select c.id, c.offer_id, c.status, c.expires_at,
         nullif(pg_catalog.to_jsonb(c)->>'analytics_journey_id','')::uuid as analytics_journey_id,
         pg_catalog.to_jsonb(c)->>'analytics_locale' as analytics_locale
    into v_claim
    from public.offer_claims c
    where c.claim_token_hash = v_token_hash
    for update;
  if not found then raise exception 'claim_not_found' using errcode = 'P0002'; end if;

  select id, merchant_profile_id, commission_kind, status, valid_from, valid_to
    into v_offer
    from public.merchant_offers
    where id = v_claim.offer_id for no key update;

  perform kinnso_internal.merchant_role(v_offer.merchant_profile_id,v_staff,p_branch_id,case when p_branch_id is null then array['owner'] else array['owner','clerk'] end);
  if v_claim.status = 'redeemed' then
    select id, redeemed_at, kinnso_branch_id into v_existing from public.offer_redemptions where offer_claim_id = v_claim.id;
    if p_branch_id is not null and v_existing.kinnso_branch_id is distinct from p_branch_id then raise exception 'forbidden'; end if;
    return jsonb_build_object('redemption_id', v_existing.id, 'redeemed_at', v_existing.redeemed_at, 'already_redeemed', true);
  end if;

  if v_claim.status = 'expired' or now() > v_claim.expires_at then
    update public.offer_claims set status = 'expired' where id = v_claim.id and status = 'active';
    return jsonb_build_object('expired', true);
  end if;

  if v_offer.status<>'live' or (v_offer.valid_from is not null and now()<v_offer.valid_from) or (v_offer.valid_to is not null and now()>v_offer.valid_to) then raise exception 'invalid_offer_unavailable';end if;
  if p_amount_spent is not null and (p_amount_spent = 'NaN'::numeric or p_amount_spent<0) then
    raise exception 'bad_amount_spent';
  end if;

  if v_offer.commission_kind = 'percent' and p_amount_spent is null then
    raise exception 'amount_spent_required';
  end if;

  -- A partially installed consent contract must fail atomically, never discard
  -- an opted-in event or save the redemption before detecting the missing sink.
  if v_claim.analytics_journey_id is not null and
     (v_claim.analytics_locale is null or pg_catalog.to_regclass('public.traveller_analytics_events') is null) then
    raise exception 'analytics_contract_unavailable';
  end if;

  update public.offer_claims set status = 'redeemed' where id = v_claim.id;

  insert into public.offer_redemptions (offer_claim_id, merchant_profile_id, redeemed_by_merchant_user_id, amount_spent, kinnso_branch_id)
    values (v_claim.id, v_offer.merchant_profile_id, v_staff, p_amount_spent, p_branch_id)
    returning id into v_redemption_id;

  update public.merchant_offers set redeemed_count = redeemed_count + 1, updated_at = now() where id = v_offer.id;

  -- Only reached on a genuinely new redemption (both early-return branches above already
  -- exited). Emits no event for an unconsented claim (analytics_journey_id null) -- there
  -- is no anonymous/invented fallback.
  if v_claim.analytics_journey_id is not null then
    insert into public.traveller_analytics_events (
      client_event_id, journey_id, consent_version, event_name, occurred_at,
      locale, route_key, entity_type, entity_id
    ) values (
      gen_random_uuid(), v_claim.analytics_journey_id, 'v1', 'offer_redeemed', now(),
      v_claim.analytics_locale, 'offer_redemption', 'offer', v_offer.id::text
    );
  end if;

  return jsonb_build_object('redemption_id', v_redemption_id, 'redeemed_at', now(), 'already_redeemed', false);
end;
$$;


revoke all on function kinnso_internal.redeem_offer(uuid,text,numeric) from public,anon,authenticated,service_role;
create or replace function public.redeem_offer_claim(p_raw_token text,p_amount_spent numeric default null) returns jsonb language sql security definer set search_path='' as $$
 select kinnso_internal.redeem_offer(null,p_raw_token,p_amount_spent);
$$;
create function public.redeem_kinnso_offer(p_raw_token text,p_branch_id uuid,p_request_id uuid,p_amount_spent numeric default null) returns jsonb language plpgsql security definer set search_path='' as $$
declare v_actor uuid:=kinnso_internal.actor();v_digest text;v_prior kinnso_internal.workspace_requests;v_result jsonb;begin
 if p_request_id is null or p_branch_id is null or length(p_raw_token)>2048 then raise exception 'invalid_command';end if;
 perform pg_advisory_xact_lock(hashtextextended(v_actor::text||p_request_id::text,0));
 v_digest:=kinnso_internal.request_digest(jsonb_build_array('redeem',kinnso_internal.request_digest(p_raw_token),p_branch_id,p_amount_spent)::text);
 select * into v_prior from kinnso_internal.workspace_requests where actor_id=v_actor and request_id=p_request_id;
 if found and v_prior.digest<>v_digest then raise exception 'idempotency_conflict';end if;
 -- Fresh membership/branch/owner authorization also runs for a prior receipt.
 v_result:=kinnso_internal.redeem_offer(p_branch_id,p_raw_token,p_amount_spent);
 if v_prior.request_id is not null then return v_prior.result;end if;
 insert into kinnso_internal.workspace_requests values(v_actor,p_request_id,v_digest,v_result,now());return v_result;
end $$;
revoke all on function public.redeem_offer_claim(text,numeric),public.redeem_kinnso_offer(text,uuid,uuid,numeric) from public,anon,authenticated,service_role;
grant execute on function public.redeem_offer_claim(text,numeric),public.redeem_kinnso_offer(text,uuid,uuid,numeric) to authenticated;
