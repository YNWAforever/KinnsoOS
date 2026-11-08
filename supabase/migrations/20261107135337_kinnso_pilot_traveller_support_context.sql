create or replace function public.get_kinnso_support_context(p_mission_id uuid)
returns jsonb language plpgsql security definer set search_path='' as $$
declare
 a uuid:=kinnso_internal.actor();
 m public.missions;
 r kinnso_internal.pilot_runs;
 rid uuid;
begin
 if not exists(select 1 from auth.users where id=a and deleted_at is null and (banned_until is null or banned_until<=now())) then
  raise exception 'forbidden';
 end if;
 select * into m from public.missions where id=p_mission_id;
 if not found then raise exception 'mission_not_found'; end if;

 -- Preserve the existing creator and merchant projections for dual-role users.
 if exists(select 1 from public.creators where id=a and status='active') then
  begin
   perform public.get_kinnso_creator_mission(p_mission_id);
   return jsonb_build_object('type','mission','id',m.id,'title',m.title,'workspace','creator');
  exception when raise_exception then
   if sqlerrm not in ('mission_not_found','creator_required') then raise; end if;
  end;
 end if;
 if m.merchant_profile_id is not null and exists (
  select 1 from public.merchant_profiles where id=m.merchant_profile_id and user_id=a and status='active'
 ) then
  perform kinnso_internal.merchant_role(m.merchant_profile_id,a,null,array['owner']);
  return jsonb_build_object('type','mission','id',m.id,'title',m.title,'workspace','merchant');
 end if;

 -- The support create RPC calls this in its write transaction after checking
 -- its exact receipt. Match ops lock order: run, then slot, then binding.
 select c.run_id into rid from kinnso_internal.pilot_collaborations c
 join kinnso_internal.pilot_participants p on p.run_id=c.run_id
 where c.mission_id=m.id and c.status='active' and p.user_id=a and p.role='traveller'
 order by c.run_id limit 1;
 if found then
  select * into r from kinnso_internal.pilot_runs where id=rid and status='running' for share;
  if found then
   perform 1 from kinnso_internal.pilot_participants p
   where p.run_id=r.id and p.user_id=a and p.role='traveller' and p.status='active'
     and p.consented_at is not null and p.consent_version=r.participation_notice_version
     and p.consent_digest=kinnso_internal.pilot_consent_identity(r)
   for share;
   if found then
    perform 1 from kinnso_internal.pilot_collaborations c
    where c.run_id=r.id and c.mission_id=m.id and c.status='active' for share;
    if found then
     perform kinnso_internal.pilot_actor();
     return jsonb_build_object('type','mission','id',m.id,'title','Pilot support','workspace','pilot');
    end if;
   end if;
  end if;
 end if;
 if m.merchant_profile_id is not null then raise exception 'forbidden'; end if;
 raise exception 'mission_not_found';
end $$;
