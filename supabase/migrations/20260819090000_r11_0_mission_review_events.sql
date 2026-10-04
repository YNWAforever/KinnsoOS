-- R11.0: an append-only history of every submission review decision, merchant or ops. Ops
-- already has raw RLS write access to mission_milestone_submissions
-- (mission_submissions_creator_merchant_ops_update has no status-transition restriction for
-- ops) -- this table exists for the audit trail the mission detail page reads from, not to
-- close a security gap. Every review action (the existing merchant reviewSubmissionAction,
-- and a later admin_review_submission RPC) writes exactly one row here.
--
-- reason_category is required whenever action is 'reject' or 'request_revision' -- enforced
-- as a check constraint, not just at any future RPC layer, so the "rejection without a reason
-- category is impossible" guarantee holds even against a hypothetical future direct-insert
-- bypass (there is none today -- see the zero insert grant below).

create table public.mission_review_events (
  id              uuid primary key default gen_random_uuid(),
  submission_id   uuid not null references public.mission_milestone_submissions(id) on delete cascade,
  actor_type      text not null check (actor_type in ('creator', 'merchant', 'ops', 'system')),
  actor_id        uuid,
  action          text not null check (action in ('approve', 'reject', 'request_revision')),
  reason_category text,
  reason_text     text,
  created_at      timestamptz not null default now(),
  constraint mission_review_events_reason_required_check check (action not in ('reject', 'request_revision') or reason_category is not null),
  constraint mission_review_events_reason_category_check check (reason_category is null or reason_category in ('format', 'key_message', 'compliance', 'quality', 'other'))
);

create index mission_review_events_submission_idx on public.mission_review_events (submission_id, created_at desc);

alter table public.mission_review_events enable row level security;

-- Mirrors the exact join shape of mission_submissions_visible_select
-- (supabase/migrations/20260617173938_mission_rls.sql) -- creator via mission_participants
-- directly, merchant via mission_participants -> missions -> merchant_profiles, ops via
-- kinnso_ops_members -- rather than re-deriving the join from scratch.
create policy mission_review_events_select on public.mission_review_events
  for select
  to authenticated
  using (
    exists (
      select 1
      from public.mission_milestone_submissions sub
      join public.mission_participants participant on participant.id = sub.mission_participant_id
      where sub.id = mission_review_events.submission_id
        and participant.creator_id = (select auth.uid())
    )
    or exists (
      select 1
      from public.mission_milestone_submissions sub
      join public.mission_participants participant on participant.id = sub.mission_participant_id
      join public.missions mission on mission.id = participant.mission_id
      join public.merchant_profiles merchant on merchant.id = mission.merchant_profile_id
      where sub.id = mission_review_events.submission_id
        and merchant.user_id = (select auth.uid())
    )
    or exists (
      select 1
      from public.kinnso_ops_members ops
      where ops.user_id = (select auth.uid())
        and ops.status = 'active'
    )
  );

-- No insert/update/delete policy exists at all -- every row comes from a trigger-adjacent
-- action/RPC path (SECURITY DEFINER or an ops-gated action), never a direct client write.
revoke all on public.mission_review_events from public, anon, authenticated;
grant select on public.mission_review_events to authenticated;

-- review_deadline: defaulted to submitted_at + 48h (Adfocate's review_sla_hours default),
-- reset whenever submitted_at changes so a resubmission after a revision request gets a
-- fresh window. Nullable -- a submission that has never been submitted (still 'pending') has
-- no deadline.
alter table public.mission_milestone_submissions add column review_deadline timestamptz;

update public.mission_milestone_submissions
  set review_deadline = submitted_at + interval '48 hours'
  where submitted_at is not null and review_deadline is null;

-- Branches explicitly on TG_OP rather than a single `TG_OP = 'INSERT' or new.x is distinct
-- from old.x` boolean expression -- PL/pgSQL's OLD record is unassigned during an INSERT
-- trigger, and referencing OLD.submitted_at there risks "record old is not assigned yet"
-- since Postgres does not guarantee left-to-right short-circuit evaluation of OR the way
-- procedural languages do. This form never touches OLD on the INSERT path.
create or replace function public.set_submission_review_deadline() returns trigger
language plpgsql as $$
begin
  if TG_OP = 'INSERT' then
    if new.submitted_at is not null then
      new.review_deadline := new.submitted_at + interval '48 hours';
    end if;
  elsif new.submitted_at is not null and new.submitted_at is distinct from old.submitted_at then
    new.review_deadline := new.submitted_at + interval '48 hours';
  end if;
  return new;
end;
$$;

create trigger set_submission_review_deadline_trg
  before insert or update on public.mission_milestone_submissions
  for each row execute function public.set_submission_review_deadline();
