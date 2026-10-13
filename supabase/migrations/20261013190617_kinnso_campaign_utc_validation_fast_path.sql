-- Avoid per-row enumeration of timezone catalog for the canonical UTC default.
-- Original role/ops policy, immutable terms, bounds, search path and ACL remain unchanged.
create or replace function kinnso_internal.guard_campaign_terms() returns trigger
language plpgsql set search_path='' as $$ begin
 if tg_op='DELETE' then
  if old.kinnso_terms_locked and auth.uid() is not null then raise exception 'immutable_campaign_terms';end if;
  return old;
 end if;
 -- The audited SECURITY DEFINER setter retains its operational policy contract.
 -- Ordinary table writers (including an ops user's direct UPDATE) cannot opt in.
 if ((tg_op='INSERT' and new.auto_approve_policy<>'off') or (tg_op='UPDATE' and new.auto_approve_policy is distinct from old.auto_approve_policy)) and auth.uid() is not null then
  if current_user<>pg_catalog.pg_get_userbyid((select proowner from pg_catalog.pg_proc where oid='public.admin_set_mission_auto_approve_policy(uuid,text)'::pg_catalog.regprocedure)) or not public.is_active_ops_role('admin') then raise exception 'forbidden' using errcode='42501';end if;
 end if;
 if tg_op='UPDATE' and old.kinnso_terms_locked then
  if (new.status='draft' and old.status<>'draft') or not new.kinnso_terms_locked or
   (to_jsonb(new)-array['status','updated_at','auto_approve_policy']) is distinct from (to_jsonb(old)-array['status','updated_at','auto_approve_policy']) then raise exception 'immutable_campaign_terms';end if;
 end if;
 if tg_op='INSERT' then new.kinnso_terms_locked:=false;
 elsif new.mission_source='merchant' and (new.status<>'draft' or new.published_at is not null) then new.kinnso_terms_locked:=true;end if;
 if new.starts_at is not null and new.ends_at is not null and new.starts_at>=new.ends_at then raise exception 'invalid_schedule';end if;
 -- UTC is the existing canonical default. Keep catalog validation for every other value, including NULL.
 if (tg_op='INSERT' or new.kinnso_schedule_time_zone is distinct from old.kinnso_schedule_time_zone) and new.kinnso_schedule_time_zone is distinct from 'UTC' then
  if not exists(select 1 from pg_catalog.pg_timezone_names where name=new.kinnso_schedule_time_zone) then raise exception 'invalid_schedule';end if;
 end if;
 return new;
end $$;
