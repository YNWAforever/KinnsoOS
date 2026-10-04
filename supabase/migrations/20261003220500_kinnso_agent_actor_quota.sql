-- Server-derived identity and a fixed quota; callers cannot select another actor's bucket or increase limits.
create table kinnso_internal.agent_quota (
 actor_id uuid primary key references auth.users(id) on delete cascade,
 window_started_at timestamptz not null,
 requests integer not null check(requests between 1 and 20)
);
alter table kinnso_internal.agent_quota enable row level security;
revoke all on kinnso_internal.agent_quota from public,anon,authenticated,service_role;
create function public.take_kinnso_agent_quota() returns boolean language plpgsql security definer set search_path='' as $$
declare actor uuid:=kinnso_internal.actor();row kinnso_internal.agent_quota;
begin
 perform pg_advisory_xact_lock(hashtextextended('kinnso-agent-quota:'||actor::text,0));
 select * into row from kinnso_internal.agent_quota where actor_id=actor for update;
 if not found then insert into kinnso_internal.agent_quota values(actor,now(),1);return true;end if;
 if row.window_started_at<=now()-interval '1 hour' then update kinnso_internal.agent_quota set window_started_at=now(),requests=1 where actor_id=actor;return true;end if;
 if row.requests>=20 then return false;end if;
 update kinnso_internal.agent_quota set requests=requests+1 where actor_id=actor;return true;
end $$;
revoke all on function public.take_kinnso_agent_quota() from public,anon,authenticated,service_role;
grant execute on function public.take_kinnso_agent_quota() to authenticated;
