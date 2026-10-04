-- Signed upload tokens can remain valid for two hours after an intent expires
-- or its metadata is deleted. Keep its path eligible for another sweep until
-- that window (plus a five-minute margin) has elapsed. Ack retires a tombstone
-- only after a successful Storage removal beyond that deadline.
create or replace function public.kinnso_media_cleanup_ack(p_paths text[]) returns void
language plpgsql security definer set search_path='' as $$
begin
 if cardinality(p_paths)>100 then raise exception 'invalid_media'; end if;
 update kinnso_internal.media_cleanup set removed_at=now()
 where object_path=any(p_paths) and queued_at<now()-interval '2 hours 5 minutes';
end $$;
revoke all on function public.kinnso_media_cleanup_ack(text[]) from public,anon,authenticated;
grant execute on function public.kinnso_media_cleanup_ack(text[]) to service_role;
