alter table public.kinnso_trip_media add column mime text check(mime in ('image/jpeg','image/png','image/webp'));
alter table public.kinnso_trip_media add column byte_size bigint check(byte_size between 1 and 10485760);
alter table public.kinnso_trip_media add column checksum text check(checksum~'^[0-9a-f]{64}$');
insert into storage.buckets(id,name,public,file_size_limit,allowed_mime_types)
values('kinnso-trip-private','kinnso-trip-private',false,10485760,array['image/jpeg','image/png','image/webp'])
on conflict(id) do update set public=false,file_size_limit=10485760,allowed_mime_types=excluded.allowed_mime_types;
create policy kinnso_trip_upload_insert on storage.objects for insert to authenticated with check(
 bucket_id='kinnso-trip-private' and exists(select 1 from public.kinnso_trip_media m
 where m.object_path=name and m.owner_id=(select auth.uid()) and m.state='pending'
 and exists(select 1 from public.trips t where t.id=m.trip_id and t.owner_user_id=(select auth.uid()))));
create policy kinnso_trip_upload_read on storage.objects for select to authenticated using(
 bucket_id='kinnso-trip-private' and exists(select 1 from public.kinnso_trip_media m
 where m.object_path=name and m.owner_id=(select auth.uid())
 and exists(select 1 from public.trips t where t.id=m.trip_id and t.owner_user_id=(select auth.uid()))));
create policy kinnso_trip_upload_delete on storage.objects for delete to authenticated using(
 bucket_id='kinnso-trip-private' and exists(select 1 from public.kinnso_trip_media m
 where m.object_path=name and m.owner_id=(select auth.uid()) and not m.attached));

create function public.prepare_trip_upload(p_trip_id uuid,p_request_id uuid,p_mime text,p_size bigint) returns jsonb
language plpgsql security definer set search_path='' as $$
declare actor uuid:=kinnso_internal.actor(); prior kinnso_internal.requests; digest text; id uuid; result jsonb;
begin
 if p_request_id is null or p_mime not in ('image/jpeg','image/png','image/webp') or p_mime is null or p_size is null or p_size not between 1 and 10485760 then raise exception 'invalid_media'; end if;
 perform pg_advisory_xact_lock(hashtextextended(actor::text||p_request_id::text,0));
 perform 1 from public.trips t where t.id=p_trip_id and t.owner_user_id=actor for update;
 if not found then raise exception 'trip_not_found'; end if;
 digest:=kinnso_internal.request_digest(jsonb_build_object('upload',p_trip_id,'mime',p_mime,'size',p_size)::text);
 select * into prior from kinnso_internal.requests where actor_id=actor and request_id=p_request_id;
 if found then if prior.digest<>digest then raise exception 'idempotency_conflict'; end if; return prior.result; end if;
 if (select count(*) from public.kinnso_trip_media where trip_id=p_trip_id)>=100 then raise exception 'invalid_media_quota'; end if;
 id:=gen_random_uuid();
 insert into public.kinnso_trip_media(id,owner_id,trip_id,object_path,mime,byte_size) values(id,actor,p_trip_id,actor::text||'/'||p_trip_id::text||'/'||id::text,p_mime,p_size);
 result:=jsonb_build_object('id',id,'path',actor::text||'/'||p_trip_id::text||'/'||id::text,'state','pending','visibility','private','ownerId',actor);
 insert into kinnso_internal.requests(actor_id,request_id,digest,result) values(actor,p_request_id,digest,result);return result;
end $$;

-- A narrow private service finalizer, after actual byte/MIME/checksum validation.
-- Browser roles have no execution privilege on this entrypoint.
create function public.finalize_trip_upload(p_actor_id uuid,p_media_id uuid,p_checksum text) returns jsonb
language plpgsql security definer set search_path='' as $$
declare m public.kinnso_trip_media;
begin
 select * into m from public.kinnso_trip_media where id=p_media_id and owner_id=p_actor_id for update;
 if not found or not exists(select 1 from public.trips where id=m.trip_id and owner_user_id=p_actor_id) then raise exception 'media_not_found'; end if;
 if p_checksum is null or p_checksum!~'^[0-9a-f]{64}$' or not exists(select 1 from storage.objects where bucket_id='kinnso-trip-private' and name=m.object_path)
 then raise exception 'invalid_media'; end if;
 if m.state='ready' and m.checksum<>p_checksum then raise exception 'idempotency_conflict'; end if;
 update public.kinnso_trip_media set state='ready',checksum=p_checksum where id=m.id;
 return jsonb_build_object('id',m.id,'ownerId',m.owner_id,'visibility','private','state','ready');
end $$;
revoke all on function public.prepare_trip_upload(uuid,uuid,text,bigint) from public,anon;
grant execute on function public.prepare_trip_upload(uuid,uuid,text,bigint) to authenticated;
revoke all on function public.finalize_trip_upload(uuid,uuid,text) from public,anon,authenticated;
grant execute on function public.finalize_trip_upload(uuid,uuid,text) to service_role;

create table kinnso_internal.media_cleanup (
 object_path text primary key, queued_at timestamptz not null default now(), removed_at timestamptz
);
alter table kinnso_internal.media_cleanup enable row level security;
revoke all on kinnso_internal.media_cleanup from public,anon,authenticated;
create function kinnso_internal.media_removed() returns trigger language plpgsql security definer set search_path='' as $$
begin insert into kinnso_internal.media_cleanup(object_path) values(old.object_path) on conflict do nothing;return old;end $$;
create trigger kinnso_media_cleanup after delete on public.kinnso_trip_media for each row execute function kinnso_internal.media_removed();
create function public.kinnso_media_cleanup_candidates() returns jsonb language sql security definer set search_path='' as $$
 select coalesce(jsonb_agg(object_path),'[]') from(select object_path from kinnso_internal.media_cleanup where removed_at is null
 union select object_path from public.kinnso_trip_media where state='pending' and created_at<now()-interval '24 hours' limit 100) pending;
$$;
create function public.kinnso_media_cleanup_ack(p_paths text[]) returns void language plpgsql security definer set search_path='' as $$
begin
 if cardinality(p_paths)>100 then raise exception 'invalid_media'; end if;
 update kinnso_internal.media_cleanup set removed_at=now() where object_path=any(p_paths);
 update public.kinnso_trip_media set state='failed' where object_path=any(p_paths) and state='pending' and created_at<now()-interval '24 hours';
end $$;
revoke all on function kinnso_internal.media_removed(),public.kinnso_media_cleanup_candidates(),public.kinnso_media_cleanup_ack(text[]) from public,anon,authenticated;
grant execute on function public.kinnso_media_cleanup_candidates(),public.kinnso_media_cleanup_ack(text[]) to service_role;
