-- R11.1 -- opt-in per-mission auto-approval for submissions whose latest verification job
-- lands on the highest-confidence signal. Off by default: a mission never auto-approves
-- unless an ops admin explicitly turns it on via admin_set_mission_auto_approve_policy.
alter table public.missions
  add column auto_approve_policy text not null default 'off'
    check (auto_approve_policy in ('off', 'verified_signal_only'));

-- Fires only on the specific transition into status='ready', confidence_status='verified_signal'
-- -- the `is distinct from` guard stops it re-firing on an unrelated future update to an
-- already-verified-signal row.
--
-- A SEPARATE function from admin_review_submission, not a reuse of it: admin_review_submission
-- is hard-gated on is_active_ops_role('admin') with a human caller's auth.uid(), and this runs
-- from a trigger fired by the scan worker's service-role UPDATE -- there is no human auth.uid()
-- here, so that gate can never pass and must not be present.
--
-- Does NOT call ops_audit_log_append: that function resolves its actor via
-- `select id from kinnso_ops_members where user_id = auth.uid()` and raises 'forbidden' when it
-- finds none (20260628130000_ops_audit_log_and_creator_analytics.sql) -- auth.uid() is null
-- here for the same reason admin_review_submission can't be reused, so the call would raise and
-- be silently swallowed below, writing nothing. Unlike mission_review_events (whose actor_type
-- already has a 'system' value for exactly this case), the ops_audit_log table's own schema has
-- no representation for a non-ops actor (actor_ops_member_id is `not null references
-- kinnso_ops_members(id)`) -- there is no row to point it at. mission_review_events is this
-- action's complete audit trail on its own.
create or replace function public.notify_verification_auto_approve() returns trigger
language plpgsql security definer set search_path = public as $$
declare
  v_submission_id uuid;
  v_policy        text;
  v_status        text;
begin
  if new.status = 'ready' and new.confidence_status = 'verified_signal'
     and (old.status, old.confidence_status) is distinct from (new.status, new.confidence_status) then

    v_submission_id := new.mission_milestone_submission_id;

    select mi.auto_approve_policy, sub.status
      into v_policy, v_status
    from public.mission_milestone_submissions sub
    join public.mission_participants participant on participant.id = sub.mission_participant_id
    join public.missions mi on mi.id = participant.mission_id
    where sub.id = v_submission_id;

    if v_policy = 'verified_signal_only' and v_status = 'submitted' then
      begin
        update public.mission_milestone_submissions
          set status = 'approved', reviewed_at = now()
          where id = v_submission_id and status = 'submitted';

        if found then
          insert into public.mission_review_events (submission_id, actor_type, actor_id, action, reason_category, reason_text)
            values (v_submission_id, 'system', null, 'approve', null, null);
        end if;
      exception when others then
        raise warning 'notify_verification_auto_approve failed: %', sqlerrm;
      end;
    end if;
  end if;

  return new;
end;
$$;

create trigger notify_verification_auto_approve_trg
  after update on public.mission_verification_jobs
  for each row execute function public.notify_verification_auto_approve();

-- Small ops-gated setter -- validates the enum up front (raising a clean `bad_policy`
-- exception) rather than relying on the column's own check constraint to surface a raw
-- Postgres error, matching the same class of guard admin_review_submission's
-- bad_reason_category check added in R11.0.
create or replace function public.admin_set_mission_auto_approve_policy(p_mission_id uuid, p_policy text)
returns void
language plpgsql security definer set search_path = public as $$
begin
  if not public.is_active_ops_role('admin') then
    raise exception 'forbidden' using errcode = '42501';
  end if;
  if p_policy not in ('off', 'verified_signal_only') then
    raise exception 'bad_policy';
  end if;

  update public.missions set auto_approve_policy = p_policy, updated_at = now() where id = p_mission_id;
  if not found then
    raise exception 'not_found';
  end if;

  perform public.ops_audit_log_append('mission', p_mission_id, 'mission.auto_approve_policy', null,
    jsonb_build_object('policy', p_policy));
end;
$$;

revoke all on function public.admin_set_mission_auto_approve_policy(uuid, text) from public, anon;
grant execute on function public.admin_set_mission_auto_approve_policy(uuid, text) to authenticated;
