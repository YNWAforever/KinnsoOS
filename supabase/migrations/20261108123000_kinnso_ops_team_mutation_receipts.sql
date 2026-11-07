-- Commit each team action and its actor-scoped receipt in the same transaction.
create function public.mutate_kinnso_ops_team(
  p_request_id uuid, p_action text, p_target uuid default null,
  p_email text default null, p_role text default null, p_reason text default null
) returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  v_actor uuid := kinnso_internal.actor();
  v_email text := lower(btrim(p_email));
  v_reason text := btrim(p_reason);
  v_digest text;
  v_prior kinnso_internal.requests;
  v_result jsonb;
  v_invite_id uuid;
  v_token text;
begin
  if not public.is_active_ops_role('owner') then
    raise exception 'forbidden' using errcode = '42501';
  end if;
  if p_request_id is null or not coalesce(case p_action
    when 'invite' then p_target is null and p_reason is null
      and length(v_email) <= 254 and v_email ~ '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$'
      and p_role in ('owner','admin','moderator','analyst')
    when 'revoke' then p_target is not null and p_email is null and p_role is null and p_reason is null
    when 'setRole' then p_target is not null and p_email is null and length(v_reason) between 1 and 500
      and p_role in ('owner','admin','moderator','analyst')
    when 'suspend' then p_target is not null and p_email is null and p_role is null and length(v_reason) between 1 and 500
    when 'reactivate' then p_target is not null and p_email is null and p_role is null and length(v_reason) between 1 and 500
    else false end, false) then
    raise exception 'invalid_team_command' using errcode = '22000';
  end if;

  -- Use the same lock and key as the shared command receipt store.
  perform pg_advisory_xact_lock(hashtextextended(v_actor::text || p_request_id::text,0));
  if not public.is_active_ops_role('owner') then
    raise exception 'forbidden' using errcode = '42501';
  end if;
  v_digest := kinnso_internal.request_digest(
    jsonb_build_array('ops.team',p_action,p_target,v_email,p_role,v_reason)::text
  );
  select * into v_prior from kinnso_internal.requests
   where actor_id=v_actor and request_id=p_request_id;
  if found then
    if v_prior.digest <> v_digest then
      raise exception 'REQUEST_ID_REUSED' using errcode = '23505';
    end if;
    v_result := v_prior.result;
  else
    case p_action
      when 'invite' then
        v_token := public.admin_invite_ops_member(v_email,p_role);
        select id into strict v_invite_id from public.kinnso_ops_invites where token=v_token;
        v_result := jsonb_build_object('inviteId',v_invite_id);
      when 'revoke' then
        perform public.admin_revoke_ops_invite(p_target);
        v_result := jsonb_build_object('id',p_target,'status','revoked');
      when 'setRole' then
        perform public.admin_set_ops_member_role(p_target,p_role,v_reason);
        v_result := jsonb_build_object('id',p_target,'role',p_role);
      when 'suspend' then
        perform public.admin_suspend_ops_member(p_target,v_reason);
        v_result := jsonb_build_object('id',p_target,'status','suspended');
      when 'reactivate' then
        perform public.admin_reactivate_ops_member(p_target,v_reason);
        v_result := jsonb_build_object('id',p_target,'status','active');
    end case;
    insert into kinnso_internal.requests(actor_id,request_id,digest,result)
      values(v_actor,p_request_id,v_digest,v_result);
  end if;

  if p_action='invite' then
    -- The receipt stores only the existing invite ID. Acceptance still checks
    -- its current status, expiry, and the invitee's verified email.
    if v_token is null then
      select token into v_token from public.kinnso_ops_invites
       where id=(v_result->>'inviteId')::uuid;
      if not found then
        raise exception 'INVITE_RECEIPT_UNAVAILABLE' using errcode = '22000';
      end if;
    end if;
    return jsonb_build_object('token',v_token);
  end if;
  return v_result;
end
$$;

revoke all on function public.mutate_kinnso_ops_team(uuid,text,uuid,text,text,text)
  from public,anon,authenticated;
grant execute on function public.mutate_kinnso_ops_team(uuid,text,uuid,text,text,text) to authenticated;
