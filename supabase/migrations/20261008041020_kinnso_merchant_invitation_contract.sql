-- Additive local-reviewed invitation contract. Production application/policy is separate.
-- No raw email/token persistence, account search, mail send, owner grant or member upsert.
create table kinnso_internal.merchant_invitations (
 id uuid primary key,
 merchant_id uuid not null references public.merchant_profiles(id) on delete cascade,
 issuer_id uuid not null references auth.users(id) on delete cascade,
 token_digest text not null unique check(token_digest ~ '^[0-9a-f]{64}$'),
 recipient_digest text not null check(recipient_digest ~ '^[0-9a-f]{64}$'),
 label text not null check(length(btrim(label)) between 1 and 120),
 role text not null check(role in ('marketing','clerk','finance')),
 branch_ids uuid[] not null check(cardinality(branch_ids)<=100),
 created_at timestamptz not null default now(),
 expires_at timestamptz not null check(expires_at>created_at),
 revoked_at timestamptz,
 invalidated_at timestamptz,
 accepted_at timestamptz,
 accepted_by uuid references auth.users(id) on delete set null
);
create index merchant_invitations_company_keyset on kinnso_internal.merchant_invitations(merchant_id,id);
alter table kinnso_internal.merchant_invitations enable row level security;
revoke all on kinnso_internal.merchant_invitations from public,anon,authenticated,service_role;

-- Permanently invalidate unused grants when ownership/status changes, even if
-- the former owner/status later returns. Unrelated profile edits preserve them.
-- Record the system invalidation time without inventing an actor for admin SQL.
create function kinnso_internal.invalidate_merchant_invitations() returns trigger
language plpgsql security definer set search_path='' as $$
begin
 if old.user_id is distinct from new.user_id or new.status is distinct from 'active' then
  update kinnso_internal.merchant_invitations set invalidated_at=now()
   where merchant_id=new.id and accepted_at is null and revoked_at is null and invalidated_at is null;
 end if;
 return new;
end $$;
create trigger kinnso_invalidate_merchant_invitations after update of user_id,status on public.merchant_profiles
for each row when(old.user_id is distinct from new.user_id or old.status is distinct from new.status)
execute function kinnso_internal.invalidate_merchant_invitations();

create function kinnso_internal.invitation_branches(p_merchant uuid,p_branches uuid[]) returns void
language plpgsql security definer set search_path='' as $$
declare branch uuid;
begin
 if p_branches is null or cardinality(p_branches)>100 or cardinality(p_branches)<>(select count(distinct x) from unnest(p_branches)x) then raise exception 'invalid_branch';end if;
 foreach branch in array p_branches loop
  perform 1 from kinnso_internal.merchant_branches where id=branch and merchant_id=p_merchant and active for share;
  if not found then raise exception 'invalid_branch';end if;
 end loop;
end $$;

create function kinnso_internal.intended_merchant_invitation(p_token text) returns kinnso_internal.merchant_invitations
language plpgsql security definer set search_path='' as $$
declare actor uuid:=kinnso_internal.actor();invite kinnso_internal.merchant_invitations;email text;
begin
 if p_token is null or p_token !~ '^[0-9a-f]{64}$' then raise exception 'invalid_command';end if;
 select * into invite from kinnso_internal.merchant_invitations where token_digest=kinnso_internal.request_digest(p_token);
 if not found or invite.revoked_at is not null or invite.invalidated_at is not null or (invite.accepted_at is null and invite.expires_at<=now()) then raise exception 'forbidden';end if;
 -- Provider-managed verified address, never user_metadata or stale JWT email claims.
 select lower(btrim(u.email)) into email from auth.users u where u.id=actor and u.email_confirmed_at is not null and u.email is not null for share;
 if not found or invite.recipient_digest<>kinnso_internal.request_digest(email||':'||invite.token_digest) then raise exception 'forbidden';end if;
 -- Ownership transfer/suspension immediately invalidates an outstanding issuer's grant.
 perform kinnso_internal.merchant_role(invite.merchant_id,invite.issuer_id,null,array['owner']);
 return invite;
end $$;

create function public.apply_kinnso_merchant_invitation(p_merchant_id uuid,p_request_id uuid,p_command jsonb) returns jsonb
language plpgsql security definer set search_path='' as $$
declare actor uuid:=kinnso_internal.actor();prior kinnso_internal.workspace_requests;invite kinnso_internal.merchant_invitations;
 request_digest text;result jsonb;invite_id uuid;branches uuid[];email text;token_digest text;action text:=p_command->>'type';reason text;
begin
 perform kinnso_internal.merchant_role(p_merchant_id,actor,null,array['owner']);
 if p_request_id is null or p_command is null or octet_length(p_command::text)>16384 then raise exception 'invalid_command';end if;
 perform pg_advisory_xact_lock(hashtextextended(actor::text||p_request_id::text,0));
 request_digest:=kinnso_internal.request_digest(jsonb_build_array('merchantInvitation',p_merchant_id,p_command)::text);
 select * into prior from kinnso_internal.workspace_requests where actor_id=actor and request_id=p_request_id;
 if found then if prior.digest<>request_digest then raise exception 'idempotency_conflict';end if;return prior.result;end if;
 if jsonb_typeof(p_command->'reason') is distinct from 'string' or length(btrim(p_command->>'reason')) not between 1 and 2000 then raise exception 'invalid_command';end if;
 reason:=btrim(p_command->>'reason');invite_id:=(p_command->>'id')::uuid;
 if invite_id is null then raise exception 'invalid_command';end if;
 if action='create' then
  perform kinnso_internal.keys(p_command,array['type','id','token','email','label','role','branchIds','reason']);
  if jsonb_typeof(p_command->'token') is distinct from 'string' or p_command->>'token' !~ '^[0-9a-f]{64}$'
    or jsonb_typeof(p_command->'email') is distinct from 'string' or length(p_command->>'email')>320
    or btrim(p_command->>'email') !~ '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$'
    or jsonb_typeof(p_command->'label') is distinct from 'string' or length(btrim(p_command->>'label')) not between 1 and 120
    or p_command->>'role' is null or p_command->>'role' not in ('marketing','clerk','finance')
    or jsonb_typeof(p_command->'branchIds') is distinct from 'array' then raise exception 'invalid_command';end if;
  select coalesce(array_agg(value::uuid),'{}') into branches from jsonb_array_elements_text(p_command->'branchIds');
  perform kinnso_internal.invitation_branches(p_merchant_id,branches);
  -- Serialize the bounded pending-invitation quota, without searching recipient accounts.
  perform pg_advisory_xact_lock(hashtextextended('merchantInvitations:'||p_merchant_id::text,0));
  if (select count(*) from kinnso_internal.merchant_invitations where merchant_id=p_merchant_id and accepted_at is null and revoked_at is null and invalidated_at is null and expires_at>now())>=100 then raise exception 'quota_exceeded';end if;
  email:=lower(btrim(p_command->>'email'));token_digest:=kinnso_internal.request_digest(p_command->>'token');
  insert into kinnso_internal.merchant_invitations(id,merchant_id,issuer_id,token_digest,recipient_digest,label,role,branch_ids,expires_at)
   values(invite_id,p_merchant_id,actor,token_digest,kinnso_internal.request_digest(email||':'||token_digest),btrim(p_command->>'label'),p_command->>'role',branches,now()+interval '24 hours') returning * into invite;
  result:=jsonb_build_object('id',invite_id,'status','pending','expiresAt',invite.expires_at);
  insert into kinnso_internal.merchant_audit(merchant_id,actor_id,action,entity_id,reason) values(p_merchant_id,actor,'createInvitation',invite_id,reason);
 elsif action='revoke' then
  perform kinnso_internal.keys(p_command,array['type','id','reason']);
  select * into invite from kinnso_internal.merchant_invitations where id=invite_id and merchant_id=p_merchant_id for update;
  if not found then raise exception 'forbidden';end if;
  if invite.accepted_at is not null then raise exception 'revision_conflict';end if;
  if invite.revoked_at is null then
   update kinnso_internal.merchant_invitations set revoked_at=now() where id=invite_id;
   insert into kinnso_internal.merchant_audit(merchant_id,actor_id,action,entity_id,reason) values(p_merchant_id,actor,'revokeInvitation',invite_id,reason);
  end if;
  result:=jsonb_build_object('id',invite_id,'status','revoked');
 else raise exception 'invalid_command';end if;
 insert into kinnso_internal.workspace_requests values(actor,p_request_id,request_digest,result,now());return result;
end $$;

create function public.list_kinnso_merchant_invitations(p_merchant_id uuid,p_after uuid default null) returns jsonb
language plpgsql security definer set search_path='' as $$
declare actor uuid:=kinnso_internal.actor();rows jsonb;cursor uuid;
begin
 perform kinnso_internal.merchant_role(p_merchant_id,actor,null,array['owner']);
 if p_after is not null and not exists(select 1 from kinnso_internal.merchant_invitations where id=p_after and merchant_id=p_merchant_id) then raise exception 'invalid_cursor';end if;
 with bounded as(select i.*,row_number()over(order by id)n from kinnso_internal.merchant_invitations i where merchant_id=p_merchant_id and (p_after is null or id>p_after) order by id limit 51)
 select coalesce(jsonb_agg(jsonb_build_object('id',id,'label',label,'role',role,'branchIds',branch_ids,'expiresAt',expires_at,
  'status',case when accepted_at is not null then 'accepted' when revoked_at is not null then 'revoked' when invalidated_at is not null then 'invalidated' when expires_at<=now() then 'expired' else 'pending' end) order by id)filter(where n<=50),'[]'),
  case when count(*)>50 then (array_agg(id order by id))[50] else null end into rows,cursor from bounded;
 return jsonb_build_object('merchantId',p_merchant_id,'invitations',rows,'nextCursor',cursor);
end $$;

create function public.preview_kinnso_merchant_invitation(p_token text) returns jsonb
language plpgsql security definer set search_path='' as $$
declare invite kinnso_internal.merchant_invitations:=kinnso_internal.intended_merchant_invitation(p_token);
begin
 if invite.accepted_at is not null then raise exception 'forbidden';end if;
 perform kinnso_internal.invitation_branches(invite.merchant_id,invite.branch_ids);
 return jsonb_build_object('id',invite.id,'merchantId',invite.merchant_id,'name',(select company_name from public.merchant_profiles where id=invite.merchant_id),
  'role',invite.role,'branchIds',invite.branch_ids,'expiresAt',invite.expires_at,'branches',coalesce((select jsonb_agg(jsonb_build_object('id',b.id,'name',b.name) order by b.id) from kinnso_internal.merchant_branches b where b.merchant_id=invite.merchant_id and b.id=any(invite.branch_ids)),'[]'));
end $$;

create function public.accept_kinnso_merchant_invitation(p_token text,p_request_id uuid) returns jsonb
language plpgsql security definer set search_path='' as $$
declare actor uuid:=kinnso_internal.actor();invite kinnso_internal.merchant_invitations;prior kinnso_internal.workspace_requests;request_digest text;result jsonb;inserted uuid;
begin
 if p_request_id is null then raise exception 'invalid_command';end if;
 invite:=kinnso_internal.intended_merchant_invitation(p_token);
 perform pg_advisory_xact_lock(hashtextextended(actor::text||p_request_id::text,0));
 request_digest:=kinnso_internal.request_digest(jsonb_build_array('acceptMerchantInvitation',invite.id,invite.token_digest)::text);
 select * into prior from kinnso_internal.workspace_requests where actor_id=actor and request_id=p_request_id;
 select * into invite from kinnso_internal.merchant_invitations where id=invite.id for update;
 if invite.revoked_at is not null or invite.invalidated_at is not null then raise exception 'forbidden';end if;
 if prior.request_id is not null then
  if prior.digest<>request_digest then raise exception 'idempotency_conflict';end if;
  if invite.accepted_by is distinct from actor or invite.accepted_at is null then raise exception 'forbidden';end if;
  -- A receipt is historical; it cannot reactivate an offboarded member.
  perform kinnso_internal.merchant_role(invite.merchant_id,actor,null,array['marketing','clerk','finance']);
  return prior.result;
 end if;
 if invite.accepted_at is not null or invite.expires_at<=now() then raise exception 'forbidden';end if;
 perform kinnso_internal.invitation_branches(invite.merchant_id,invite.branch_ids);
 if exists(select 1 from public.merchant_profiles where id=invite.merchant_id and user_id=actor) then raise exception 'revision_conflict';end if;
 insert into kinnso_internal.merchant_members(merchant_id,user_id,role,branch_ids,active) values(invite.merchant_id,actor,invite.role,invite.branch_ids,true)
  on conflict(merchant_id,user_id) do nothing returning user_id into inserted;
 if inserted is null then raise exception 'revision_conflict';end if;
 update kinnso_internal.merchant_invitations set accepted_at=now(),accepted_by=actor where id=invite.id;
 result:=jsonb_build_object('id',invite.id,'merchantId',invite.merchant_id,'role',invite.role,'branchIds',invite.branch_ids,'status','accepted');
 insert into kinnso_internal.merchant_audit(merchant_id,actor_id,action,entity_id,reason) values(invite.merchant_id,actor,'acceptInvitation',invite.id,'Verified recipient explicitly accepted team invitation');
 insert into kinnso_internal.workspace_requests values(actor,p_request_id,request_digest,result,now());return result;
end $$;

revoke all on function kinnso_internal.invitation_branches(uuid,uuid[]),kinnso_internal.intended_merchant_invitation(text),kinnso_internal.invalidate_merchant_invitations() from public,anon,authenticated,service_role;
revoke all on function public.apply_kinnso_merchant_invitation(uuid,uuid,jsonb),public.list_kinnso_merchant_invitations(uuid,uuid),public.preview_kinnso_merchant_invitation(text),public.accept_kinnso_merchant_invitation(text,uuid) from public,anon,authenticated,service_role;
grant execute on function public.apply_kinnso_merchant_invitation(uuid,uuid,jsonb),public.list_kinnso_merchant_invitations(uuid,uuid),public.preview_kinnso_merchant_invitation(text),public.accept_kinnso_merchant_invitation(text,uuid) to authenticated;
