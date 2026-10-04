create table kinnso_internal.trip_shares (
 id uuid primary key default gen_random_uuid(),
 owner_id uuid not null references auth.users(id) on delete cascade,
 trip_id uuid not null references public.trips(id) on delete cascade,
 token_hash text not null unique check(token_hash~'^[0-9a-f]{64}$'),
 projection jsonb not null, media_ids uuid[] not null,
 created_at timestamptz not null default now(), expires_at timestamptz not null, revoked_at timestamptz
);
alter table kinnso_internal.trip_shares enable row level security;
revoke all on kinnso_internal.trip_shares from public,anon,authenticated;
create index kinnso_trip_shares_owner_idx on kinnso_internal.trip_shares(owner_id,created_at);
create function public.create_trip_share(p_trip_id uuid,p_stop_ids uuid[],p_media_ids uuid[],p_expires_at timestamptz)
returns jsonb language plpgsql security definer set search_path='' as $$
declare actor uuid:=kinnso_internal.actor(); t public.trips; token text; projection jsonb; id uuid;
begin
 select * into t from public.trips where public.trips.id=p_trip_id and owner_user_id=actor for update;
 if not found then raise exception 'trip_not_found'; end if;
 if p_expires_at is null or p_expires_at<=now() or p_expires_at>now()+interval '7 days'
 or p_stop_ids is null or p_media_ids is null or cardinality(p_stop_ids)>200 or cardinality(p_media_ids)>20
 or (select count(*) from public.trip_stops s where s.trip_id=t.id and s.id=any(p_stop_ids))<>cardinality(p_stop_ids)
 or (select count(*) from public.kinnso_trip_media m where m.trip_id=t.id and m.owner_id=actor and m.state='ready' and m.attached and m.id=any(p_media_ids))<>cardinality(p_media_ids)
 then raise exception 'invalid_share'; end if;
 if (select count(*) from kinnso_internal.trip_shares where owner_id=actor and revoked_at is null and expires_at>now())>=10
 or (select count(*) from kinnso_internal.trip_shares where owner_id=actor and created_at>now()-interval '1 day')>=100
 then raise exception 'invalid_share_quota'; end if;
 projection:=jsonb_build_object('title',t.title,'approvedMediaIds',to_jsonb(p_media_ids),'days',coalesce((
 select jsonb_agg(jsonb_build_object('id',d.id,'offset',d.day_offset,'title',coalesce(d.title,''),'stops',(
  select jsonb_agg(jsonb_build_object('id',s.id,'title',s.title,'placeId',s.place_id,'position',s.position,
  'startMinuteOfDay',s.start_minute_of_day,'durationMinutes',s.duration_minutes,'description','',
  'source',case when s.origin='adopted' then jsonb_build_object('guideId',s.source_guide_id,'guideVersion',s.source_guide_version,
  'creatorId',s.source_creator_id,'creatorName',coalesce(s.source_creator_name,'Creator'),'canonicalUrl',null,'withdrawn',s.source_withdrawn_at is not null) else null end)
  order by s.position) from public.trip_stops s where s.trip_day_id=d.id and s.id=any(p_stop_ids))) order by d.day_offset)
 from public.trip_days d where d.trip_id=t.id and exists(select 1 from public.trip_stops s where s.trip_day_id=d.id and s.id=any(p_stop_ids))),'[]'::jsonb));
 token:=encode(extensions.gen_random_bytes(32),'hex');id:=gen_random_uuid();
 insert into kinnso_internal.trip_shares(id,owner_id,trip_id,token_hash,projection,media_ids,expires_at)
 values(id,actor,t.id,kinnso_internal.request_digest(token),projection,p_media_ids,p_expires_at);
 -- Raw token is returned once and never stored in a request ledger.
 return jsonb_build_object('id',id,'token',token,'projection',projection,'expiresAt',p_expires_at);
end $$;
create function public.revoke_trip_share(p_share_id uuid) returns jsonb language plpgsql security definer set search_path='' as $$
declare actor uuid:=kinnso_internal.actor();
begin
 update kinnso_internal.trip_shares set revoked_at=coalesce(revoked_at,now()) where id=p_share_id and owner_id=actor;
 if not found then raise exception 'share_not_found'; end if;
 return jsonb_build_object('revoked',true);
end $$;
create function public.get_shared_trip(p_token text) returns jsonb language plpgsql stable security definer set search_path='' as $$
declare result jsonb;
begin
 if p_token is null or p_token!~'^[0-9a-f]{64}$' then raise exception 'share_not_found'; end if;
 select s.projection into result from kinnso_internal.trip_shares s where s.token_hash=kinnso_internal.request_digest(p_token)
 and s.revoked_at is null and s.expires_at>now() and exists(select 1 from public.trips t where t.id=s.trip_id);
 if not found then raise exception 'share_not_found'; end if;return result;
end $$;
create function public.get_shared_trip_media(p_token text,p_media_id uuid) returns jsonb language plpgsql stable security definer set search_path='' as $$
declare result jsonb;
begin
 if p_token is null or p_token!~'^[0-9a-f]{64}$' then raise exception 'share_not_found'; end if;
 select jsonb_build_object('path',m.object_path,'mime',m.mime) into result from kinnso_internal.trip_shares s
 join public.kinnso_trip_media m on m.trip_id=s.trip_id and m.owner_id=s.owner_id
 where s.token_hash=kinnso_internal.request_digest(p_token) and s.revoked_at is null and s.expires_at>now()
 and m.id=p_media_id and m.id=any(s.media_ids) and m.state='ready' and m.attached;
 if not found then raise exception 'share_not_found'; end if;return result;
end $$;
revoke all on function public.create_trip_share(uuid,uuid[],uuid[],timestamptz),public.revoke_trip_share(uuid),public.get_shared_trip(text),public.get_shared_trip_media(text,uuid) from public,anon,authenticated;
grant execute on function public.create_trip_share(uuid,uuid[],uuid[],timestamptz),public.revoke_trip_share(uuid) to authenticated;
grant execute on function public.get_shared_trip(text) to anon,authenticated;
grant execute on function public.get_shared_trip_media(text,uuid) to service_role;
