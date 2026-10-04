-- Allow platform='youtube' on the mission verification path so YouTube video
-- proofs can be auto-verified. creator_social_handles already permits 'youtube'.
alter table public.mission_social_snapshots
  drop constraint if exists mission_social_snapshots_platform_check,
  add constraint mission_social_snapshots_platform_check
    check (platform in ('instagram','threads','youtube'));

alter table public.mission_verification_jobs
  drop constraint if exists mission_verification_jobs_platform_check,
  add constraint mission_verification_jobs_platform_check
    check (platform in ('instagram','threads','youtube'));
