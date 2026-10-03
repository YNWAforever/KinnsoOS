-- mission_verification_jobs: tracks per-submission post verification by the scan worker.
-- Mirrors creator_scan_jobs (lifecycle + owner-select RLS + single-active index).
create table public.mission_verification_jobs (
  id                              uuid primary key default gen_random_uuid(),
  mission_milestone_submission_id uuid not null references public.mission_milestone_submissions(id) on delete cascade,
  creator_id                      uuid not null references public.creators(id) on delete cascade,
  platform                        text check (platform in ('instagram','threads')),
  proof_url                       text,
  status                          text not null default 'queued'
                                    check (status in ('queued','fetching','ready','failed')),
  confidence_status               text check (confidence_status in ('verified_signal','needs_review','unavailable')),
  error                           text,
  started_at                      timestamptz,
  completed_at                    timestamptz,
  created_at                      timestamptz not null default now(),
  updated_at                      timestamptz not null default now()
);

create index mission_verification_jobs_submission_idx
  on public.mission_verification_jobs (mission_milestone_submission_id);
create index mission_verification_jobs_creator_created_idx
  on public.mission_verification_jobs (creator_id, created_at desc);

-- One active job per submission (prevents duplicate fetches on double-submit).
create unique index mission_verification_jobs_one_active
  on public.mission_verification_jobs (mission_milestone_submission_id)
  where status in ('queued','fetching');

-- Owner-select only; the worker writes via service_role (bypasses RLS).
alter table public.mission_verification_jobs enable row level security;
create policy "mission_verification_jobs_owner_select" on public.mission_verification_jobs
  for select using (creator_id = auth.uid());

grant select on public.mission_verification_jobs to authenticated;
revoke all on public.mission_verification_jobs from anon;
