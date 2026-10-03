-- Claim and finalization serialize on the same media row. A cleanup claim
-- permanently expires the intent before any external Storage deletion occurs.
create or replace function public.claim_kinnso_media_cleanup() returns jsonb
language plpgsql security definer set search_path='' as $$
begin
 with expired as (
  select id from public.kinnso_trip_media
  where state='pending' and created_at<now()-interval '24 hours'
  order by created_at,id limit 100 for update skip locked
 ), claimed as (
  update public.kinnso_trip_media m set state='failed'
  from expired e where m.id=e.id and m.state='pending'
  returning m.object_path
 )
 insert into kinnso_internal.media_cleanup(object_path)
 select object_path from claimed
 on conflict(object_path) do update set removed_at=null;

 return (select coalesce(jsonb_agg(object_path),'[]'::jsonb) from (
  select object_path from kinnso_internal.media_cleanup
  where removed_at is null order by queued_at,object_path limit 100
 ) queued);
end $$;
revoke all on function public.claim_kinnso_media_cleanup() from public,anon,authenticated;
grant execute on function public.claim_kinnso_media_cleanup() to service_role;

-- Read-only inspection remains available to the private service role. Legacy
-- callers cannot select unclaimed pending uploads for external deletion.
create or replace function public.kinnso_media_cleanup_candidates() returns jsonb
language sql security definer set search_path='' as $$
 select coalesce(jsonb_agg(object_path),'[]'::jsonb) from (
  select object_path from kinnso_internal.media_cleanup
  where removed_at is null order by queued_at,object_path limit 100
 ) queued;
$$;
revoke all on function public.kinnso_media_cleanup_candidates() from public,anon,authenticated;
grant execute on function public.kinnso_media_cleanup_candidates() to service_role;

create or replace function public.finalize_trip_upload(p_actor_id uuid,p_media_id uuid,p_checksum text) returns jsonb
language plpgsql security definer set search_path='' as $$
declare m public.kinnso_trip_media;
begin
 select * into m from public.kinnso_trip_media where id=p_media_id and owner_id=p_actor_id for update;
 if not found or not exists(select 1 from public.trips where id=m.trip_id and owner_user_id=p_actor_id) then raise exception 'media_not_found'; end if;
 if m.state not in ('pending','ready') then raise exception 'invalid_media'; end if;
 if p_checksum is null or p_checksum!~'^[0-9a-f]{64}$' or not exists(select 1 from storage.objects where bucket_id='kinnso-trip-private' and name=m.object_path)
 then raise exception 'invalid_media'; end if;
 if m.state='ready' and m.checksum<>p_checksum then raise exception 'idempotency_conflict'; end if;
 update public.kinnso_trip_media set state='ready',checksum=p_checksum where id=m.id;
 return jsonb_build_object('id',m.id,'ownerId',m.owner_id,'visibility','private','state','ready');
end $$;
revoke all on function public.finalize_trip_upload(uuid,uuid,text) from public,anon,authenticated;
grant execute on function public.finalize_trip_upload(uuid,uuid,text) to service_role;
