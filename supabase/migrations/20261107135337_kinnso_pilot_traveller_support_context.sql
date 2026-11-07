create or replace function public.get_kinnso_support_context(p_mission_id uuid)returns jsonb language plpgsql security definer set search_path='' as $$
declare a uuid:=kinnso_internal.actor();m public.missions;detail jsonb;begin
 if not exists(select 1 from auth.users where id=a and deleted_at is null and(banned_until is null or banned_until<=now()))then raise exception 'forbidden';end if;
 select * into m from public.missions where id=p_mission_id;if not found then raise exception 'mission_not_found';end if;
 -- Support access does not grant creator or merchant campaign access.
 if exists (
   select 1 from kinnso_internal.pilot_participants p
   join kinnso_internal.pilot_runs r on r.id=p.run_id
   join kinnso_internal.pilot_collaborations c on c.run_id=r.id
   where p.user_id=a and p.role='traveller' and p.status='active'
     and p.consented_at is not null and p.consent_version=r.participation_notice_version
     and p.consent_digest=kinnso_internal.pilot_consent_identity(r)
     and r.status='running' and c.status='active' and c.mission_id=m.id
 ) then
   perform kinnso_internal.pilot_actor();
   return jsonb_build_object('type','mission','id',m.id,'title','Pilot support','workspace','pilot');
 end if;
 if exists(select 1 from public.creators where id=a and status='active')then
  begin detail:=public.get_kinnso_creator_mission(p_mission_id);return jsonb_build_object('type','mission','id',m.id,'title',m.title,'workspace','creator');
  exception when raise_exception then if sqlerrm not in('mission_not_found','creator_required')then raise;end if;end;
 end if;
 if m.merchant_profile_id is not null then perform kinnso_internal.merchant_role(m.merchant_profile_id,a,null,array['owner']);return jsonb_build_object('type','mission','id',m.id,'title',m.title,'workspace','merchant');end if;
 raise exception 'mission_not_found';
end $$;
