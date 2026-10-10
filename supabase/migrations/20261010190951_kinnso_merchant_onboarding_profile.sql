-- Native merchant intake reuses the moderated application table. An application
-- never grants a merchant role; the existing moderator approval remains the gate.
create function kinnso_internal.validate_merchant_contact(p_input jsonb,p_profile boolean) returns void
language plpgsql set search_path='' as $$
declare field text;max_length integer;value text;port text;begin
 perform kinnso_internal.keys(p_input,case when p_profile then array['companyName','contactName','contactEmail','websiteUrl','tagline','city','logoUrl'] else array['companyName','contactName','contactEmail','websiteUrl','pitch'] end);
 foreach field in array case when p_profile then array['companyName','contactName','contactEmail','websiteUrl','tagline','city','logoUrl'] else array['companyName','contactName','contactEmail','websiteUrl','pitch'] end loop
  max_length:=case field when 'contactEmail' then 254 when 'websiteUrl' then 2048 when 'logoUrl' then 2048 when 'pitch' then 4000 when 'city' then 120 else 160 end;
  if jsonb_typeof(p_input->field) is distinct from 'string' or length(p_input->>field)>max_length then raise exception 'invalid_contact';end if;
  value:=p_input->>field;
  if translate(value,E'\t\n\r','') ~ '[[:cntrl:]]' then raise exception 'invalid_contact';end if;
  if field in ('companyName','contactEmail') and value !~ '[^[:space:]]' then raise exception 'invalid_contact';end if;
  if field='contactEmail' and value !~* '^[^@[:space:]]+@[^@[:space:]]+\.[^@[:space:]]+$' then raise exception 'invalid_contact';end if;
  if field in ('websiteUrl','logoUrl') and value<>'' and (value !~ '^https://([[:alnum:]][[:alnum:].-]*|\[[0-9A-Fa-f:]+\])(:[0-9]{1,5})?([/?#][^[:space:]]*)?$' or value ~ '[[:cntrl:]]' or value ~ E'\\\\') then raise exception 'invalid_contact';end if;
  if field in ('websiteUrl','logoUrl') and value<>'' then
   port:=substring(value from '^https://(?:\[[^]]+\]|[^/:?#]+):([0-9]+)');
   if port is not null and port::integer>65535 then raise exception 'invalid_contact';end if;
   if value ~ '^https://\[' then
    begin
     if family(substring(value from '^https://\[([^]]+)\]')::inet)<>6 then raise exception 'invalid_contact';end if;
    exception when invalid_text_representation then raise exception 'invalid_contact';end;
   end if;
  end if;
 end loop;
end $$;
revoke all on function kinnso_internal.validate_merchant_contact(jsonb,boolean) from public,anon,authenticated,service_role;

create function public.get_kinnso_merchant_onboarding() returns jsonb
language plpgsql security definer set search_path='' as $$
declare actor uuid:=kinnso_internal.actor();begin
 return jsonb_build_object('applications',coalesce((select jsonb_agg(jsonb_build_object('id',a.id,'companyName',a.company_name,'contactName',coalesce(a.contact_name,''),'contactEmail',a.contact_email,'websiteUrl',coalesce(a.website_url,''),'pitch',coalesce(a.pitch,''),'status',a.status,'createdAt',a.created_at,'decidedAt',a.decided_at,'decisionReason',a.decision_reason) order by a.created_at desc,a.id desc) from (select * from public.merchant_applications where user_id=actor order by created_at desc,id desc limit 20)a),'[]'::jsonb),
 'merchant',(select jsonb_build_object('id',m.id,'name',m.company_name,'status',m.status) from public.merchant_profiles m where user_id=actor limit 1));
end $$;

create function public.submit_kinnso_merchant_application(p_request_id uuid,p_input jsonb) returns jsonb
language plpgsql security definer set search_path='' as $$
declare actor uuid:=kinnso_internal.actor();prior kinnso_internal.workspace_requests;request_digest text;application_id uuid;application_status text;result jsonb;begin
 if p_request_id is null or p_input is null or octet_length(p_input::text)>16384 then raise exception 'invalid_application';end if;
 perform kinnso_internal.validate_merchant_contact(p_input,false);
 perform pg_advisory_xact_lock(hashtextextended(actor::text||p_request_id::text,0));
 request_digest:=kinnso_internal.request_digest(jsonb_build_array('merchantApplication',p_input)::text);
 select * into prior from kinnso_internal.workspace_requests where actor_id=actor and request_id=p_request_id;
 if found then if prior.digest<>request_digest then raise exception 'idempotency_conflict';end if;return prior.result;end if;
 perform pg_advisory_xact_lock(hashtextextended('merchantApplication:'||actor::text,0));
 if exists(select 1 from public.merchant_profiles where user_id=actor) then raise exception 'revision_conflict';end if;
 -- A second browser or an old app may already have submitted. Keep the original
 -- immutable application and return its identity instead of replacing its content.
 select id,status into application_id,application_status from public.merchant_applications where user_id=actor and status='pending' for update;
 if not found then
  insert into public.merchant_applications(user_id,company_name,contact_name,contact_email,website_url,pitch)
   values(actor,btrim(p_input->>'companyName'),nullif(btrim(p_input->>'contactName'),''),btrim(p_input->>'contactEmail'),nullif(p_input->>'websiteUrl',''),nullif(btrim(p_input->>'pitch'),''))
   on conflict (user_id) where status='pending' do nothing returning id,status into application_id,application_status;
  if application_id is null then select id,status into application_id,application_status from public.merchant_applications where user_id=actor and status='pending';end if;
 end if;
 if application_id is null then raise exception 'revision_conflict';end if;
 -- Approval may have committed while this command waited on the pending row or
 -- its unique index. Recheck after that wait; roll back any newly inserted row.
 if exists(select 1 from public.merchant_profiles where user_id=actor) then raise exception 'revision_conflict';end if;
 result:=jsonb_build_object('id',application_id,'status',application_status);
 insert into kinnso_internal.workspace_requests(actor_id,request_id,digest,result) values(actor,p_request_id,request_digest,result);
 return result;
end $$;

-- Protect the CAS token from old profile writers as well as new RPCs.
create trigger zz_kinnso_profile_updated_at before update on public.merchant_profiles
 for each row execute function kinnso_internal.bump_collaboration_updated_at();

create function public.get_kinnso_merchant_profile(p_merchant_id uuid) returns jsonb
language plpgsql security definer set search_path='' as $$
declare actor uuid:=kinnso_internal.actor();profile public.merchant_profiles;begin
 select * into profile from public.merchant_profiles where id=p_merchant_id and user_id=actor and status='active';
 if not found then raise exception 'forbidden';end if;
 return jsonb_build_object('id',profile.id,'companyName',profile.company_name,'contactName',coalesce(profile.contact_name,''),'contactEmail',coalesce(profile.contact_email,''),'websiteUrl',coalesce(profile.website_url,''),'tagline',coalesce(profile.tagline,''),'city',coalesce(profile.city,''),'logoUrl',coalesce(profile.logo_url,''),'slug',profile.slug,'status',profile.status,'tier',profile.tier,'updatedAt',profile.updated_at);
end $$;

create function public.save_kinnso_merchant_profile(p_merchant_id uuid,p_request_id uuid,p_expected_updated_at timestamptz,p_input jsonb) returns jsonb
language plpgsql security definer set search_path='' as $$
declare actor uuid:=kinnso_internal.actor();profile public.merchant_profiles;prior kinnso_internal.workspace_requests;request_digest text;result jsonb;begin
 if p_request_id is null or p_expected_updated_at is null or p_input is null or octet_length(p_input::text)>16384 then raise exception 'invalid_profile';end if;
 perform kinnso_internal.validate_merchant_contact(p_input,true);
 perform pg_advisory_xact_lock(hashtextextended(actor::text||p_request_id::text,0));
 select * into profile from public.merchant_profiles where id=p_merchant_id for update;
 if not found or profile.user_id<>actor or profile.status<>'active' then raise exception 'forbidden';end if;
 request_digest:=kinnso_internal.request_digest(jsonb_build_array('merchantProfile',p_merchant_id,p_expected_updated_at,p_input)::text);
 select * into prior from kinnso_internal.workspace_requests where actor_id=actor and request_id=p_request_id;
 if found then if prior.digest<>request_digest then raise exception 'idempotency_conflict';end if;return prior.result;end if;
 if profile.updated_at<>p_expected_updated_at then raise exception 'revision_conflict';end if;
 update public.merchant_profiles set company_name=btrim(p_input->>'companyName'),contact_name=nullif(btrim(p_input->>'contactName'),''),contact_email=btrim(p_input->>'contactEmail'),website_url=nullif(p_input->>'websiteUrl',''),tagline=nullif(btrim(p_input->>'tagline'),''),city=nullif(btrim(p_input->>'city'),''),logo_url=nullif(p_input->>'logoUrl','') where id=p_merchant_id;
 result:=public.get_kinnso_merchant_profile(p_merchant_id);
 insert into kinnso_internal.merchant_audit(merchant_id,actor_id,action,entity_id,reason) values(p_merchant_id,actor,'updateProfile',p_merchant_id,'Owner saved company profile');
 insert into kinnso_internal.workspace_requests(actor_id,request_id,digest,result) values(actor,p_request_id,request_digest,result);
 return result;
end $$;
revoke all on function public.get_kinnso_merchant_onboarding(),public.submit_kinnso_merchant_application(uuid,jsonb),public.get_kinnso_merchant_profile(uuid),public.save_kinnso_merchant_profile(uuid,uuid,timestamptz,jsonb) from public,anon,authenticated,service_role;
grant execute on function public.get_kinnso_merchant_onboarding(),public.submit_kinnso_merchant_application(uuid,jsonb),public.get_kinnso_merchant_profile(uuid),public.save_kinnso_merchant_profile(uuid,uuid,timestamptz,jsonb) to authenticated;
