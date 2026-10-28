-- One durable launch ledger and reservation transaction for scans/verifications.
-- Limits are fixed here, never supplied by a caller. Only the trusted worker
-- may reserve; browser roles cannot read or mutate the ledger or execute RPC.
create table public.worker_launch_reservations (
  id uuid primary key default gen_random_uuid(),
  creator_id uuid not null references public.creators(id) on delete cascade,
  kind text not null check (kind in ('scan', 'verification')),
  -- Deliberately no job FK: deleting a job must not refund paid launch quota.
  job_id uuid not null,
  reserved_at timestamptz not null default clock_timestamp()
);
create index worker_launch_reservations_owner_window
  on public.worker_launch_reservations (creator_id, kind, reserved_at);
alter table public.worker_launch_reservations enable row level security;
revoke all on public.worker_launch_reservations from public, anon, authenticated, service_role;
grant select on public.worker_launch_reservations to service_role;

-- Preserve the most recent known launch of each pre-migration job. Historical
-- retries cannot be reconstructed. Release requires pausing launches for 24h
-- before cutover (see rehearsal notes); backfill is additional protection.
insert into public.worker_launch_reservations (creator_id, kind, job_id, reserved_at)
select creator_id, 'scan', id, greatest(created_at, started_at)
from public.creator_scan_jobs
where greatest(created_at, started_at) > now() - interval '24 hours'
union all
select creator_id, 'verification', id, greatest(created_at, started_at)
from public.mission_verification_jobs
where greatest(created_at, started_at) > now() - interval '24 hours';

create function public.reserve_worker_launch(
  p_kind text,
  p_creator_id uuid,
  p_job_id uuid default null,
  p_submission_id uuid default null,
  p_platform text default null
)
returns table (job_id uuid, reason text)
language plpgsql security definer set search_path = '' as $$
declare
  v_now timestamptz;
  v_status text;
  v_updated_at timestamptz;
  v_job_id uuid;
  v_active integer;
  v_daily integer;
  v_platforms jsonb;
  v_proof_url text;
begin
  if p_kind is null or p_kind not in ('scan', 'verification')
    or (p_kind = 'scan' and p_submission_id is not null)
    or (p_kind = 'verification' and (p_job_id is null) = (p_submission_id is null)) then
    raise exception 'invalid reservation request' using errcode = '22023';
  end if;

  -- Always lock the owner BEFORE touching jobs. All four launch paths share
  -- this lock, including distinct verification submissions and worker replicas.
  -- READ COMMITTED queries below see the preceding reservation after waiting.
  perform 1 from public.creators where id = p_creator_id for update;
  if not found then
    return query select null::uuid, 'creator_not_found'::text;
    return;
  end if;
  v_now := clock_timestamp(); -- sample after waiting, including window expiry

  if p_job_id is not null then
    if p_kind = 'scan' then
      select j.status, j.updated_at into v_status, v_updated_at
      from public.creator_scan_jobs j
      where j.id = p_job_id and j.creator_id = p_creator_id for update;
    else
      select j.status, j.updated_at into v_status, v_updated_at
      from public.mission_verification_jobs j
      where j.id = p_job_id and j.creator_id = p_creator_id for update;
    end if;
    if not found then
      return query select null::uuid, 'job_not_found'::text;
      return;
    end if;
    if v_status <> 'failed' and not (
      v_status in ('queued', 'fetching', 'analyzing')
      and v_updated_at < v_now - interval '15 minutes'
    ) then
      return query select null::uuid, 'job_not_retryable'::text;
      return;
    end if;
  elsif p_kind = 'scan' then
    select jsonb_object_agg(h.platform, 'pending'::text) into v_platforms
    from public.creator_social_handles h where h.creator_id = p_creator_id;
    if v_platforms is null then
      return query select null::uuid, 'no_social_handles'::text;
      return;
    end if;
  else
    -- Revalidate owner in the reservation, even when an ops caller initiated it.
    select s.proof_urls[1] into v_proof_url
    from public.mission_milestone_submissions s
    join public.mission_participants mp on mp.id = s.mission_participant_id
    where s.id = p_submission_id and mp.creator_id = p_creator_id;
    if not found then
      return query select null::uuid, 'submission_not_found'::text;
      return;
    end if;
  end if;

  if p_kind = 'scan' then
    select count(*) into v_active from public.creator_scan_jobs j
    where j.creator_id = p_creator_id and j.status in ('queued', 'fetching', 'analyzing')
      and j.updated_at >= v_now - interval '15 minutes';
  else
    select count(*) into v_active from public.mission_verification_jobs j
    where j.creator_id = p_creator_id and j.status in ('queued', 'fetching')
      and j.updated_at >= v_now - interval '15 minutes';
  end if;
  if v_active >= (case when p_kind = 'scan' then 1 else 3 end) then
    return query select null::uuid,
      case when p_kind = 'scan' then 'active_job_exists' else 'too_many_active_jobs' end;
    return;
  end if;

  select count(*) into v_daily from public.worker_launch_reservations r
  where r.creator_id = p_creator_id and r.kind = p_kind
    and r.reserved_at > v_now - interval '24 hours';
  if v_daily >= (case when p_kind = 'scan' then 3 else 20 end) then
    return query select null::uuid, 'daily_quota_exceeded'::text;
    return;
  end if;

  -- Retire stale rows in the same transaction so the existing active-job unique
  -- indexes do not block recovery. Their launches still count for 24 hours.
  if p_kind = 'scan' then
    update public.creator_scan_jobs set status = 'failed',
      error = 'The scan was interrupted before it finished. Please retry.',
      completed_at = v_now, updated_at = v_now
    where creator_id = p_creator_id and status in ('queued', 'fetching', 'analyzing')
      and updated_at < v_now - interval '15 minutes';
    if p_job_id is null then
      insert into public.creator_scan_jobs (creator_id, status, progress)
      values (p_creator_id, 'queued', jsonb_build_object('platforms', v_platforms))
      returning id into v_job_id;
    else
      update public.creator_scan_jobs set status = 'queued', error = null,
        started_at = null, completed_at = null, updated_at = v_now
      where id = p_job_id returning id into v_job_id;
    end if;
  else
    update public.mission_verification_jobs set status = 'failed',
      error = 'Verification was interrupted before it finished. Please retry.',
      completed_at = v_now, updated_at = v_now
    where creator_id = p_creator_id and status in ('queued', 'fetching')
      and updated_at < v_now - interval '15 minutes';
    if p_job_id is null then
      insert into public.mission_verification_jobs
        (mission_milestone_submission_id, creator_id, platform, proof_url, status)
      values (p_submission_id, p_creator_id, p_platform, v_proof_url, 'queued')
      returning id into v_job_id;
    else
      update public.mission_verification_jobs set status = 'queued', error = null,
        started_at = null, completed_at = null, updated_at = v_now
      where id = p_job_id returning id into v_job_id;
    end if;
  end if;

  -- Success commits job + allowance together; failures roll both back. Never
  -- release a reservation on pipeline failure: failed upstream calls cost too.
  insert into public.worker_launch_reservations (creator_id, kind, job_id, reserved_at)
  values (p_creator_id, p_kind, v_job_id, v_now);
  return query select v_job_id, null::text;
exception when unique_violation then
  -- The exception block rolls back job writes and stale retirement too.
  return query select null::uuid,
    case when p_kind = 'scan' then 'active_job_exists' else 'verification_already_in_progress' end;
end;
$$;

revoke all on function public.reserve_worker_launch(text, uuid, uuid, uuid, text)
  from public, anon, authenticated;
grant execute on function public.reserve_worker_launch(text, uuid, uuid, uuid, text) to service_role;
