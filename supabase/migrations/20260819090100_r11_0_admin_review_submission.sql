-- supabase/migrations/20260819090100_r11_0_admin_review_submission.sql
--
-- R11.0: the audited ops review path. Ops already has raw RLS write access to
-- mission_milestone_submissions (see the previous migration's header comment) -- this RPC's
-- value is CAS safety, the mission_review_events audit trail, and a reason-category rule
-- enforced at the database level, not new authorization. Modeled directly on
-- admin_set_settlement_status's shape (for update -> validate -> update -> perform
-- ops_audit_log_append), the one settlement-status RPC already shipped and merged in this
-- codebase.
--
-- CAS only accepts status = 'submitted', matching reviewSubmission()
-- (apps/web/lib/missions/state.ts) exactly -- a 'revision_requested' row is not yet
-- re-decidable until the creator resubmits (which flips status back to 'submitted' via
-- submitMilestoneAction).

create or replace function public.admin_review_submission(
  p_submission_id uuid,
  p_action text,
  p_reason_category text default null,
  p_reason_text text default null
)
returns void
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  v_status text;
  v_next_status text;
begin
  if not public.is_active_ops_role('admin') then
    raise exception 'forbidden' using errcode = '42501';
  end if;

  if p_action not in ('approve', 'reject', 'request_revision') then
    raise exception 'bad_action';
  end if;

  if p_action in ('reject', 'request_revision') and coalesce(btrim(p_reason_category), '') = '' then
    raise exception 'reason_required';
  end if;

  if p_reason_category is not null and p_reason_category not in ('format', 'key_message', 'compliance', 'quality', 'other') then
    raise exception 'bad_reason_category';
  end if;

  select status into v_status from public.mission_milestone_submissions where id = p_submission_id for update;
  if not found then
    raise exception 'not_found';
  end if;
  if v_status <> 'submitted' then
    raise exception 'stale_status';
  end if;

  v_next_status := case p_action
    when 'approve' then 'approved'
    when 'request_revision' then 'revision_requested'
    else 'rejected'
  end;

  update public.mission_milestone_submissions
    set status = v_next_status,
        merchant_feedback = coalesce(p_reason_text, merchant_feedback),
        reviewed_at = now(),
        reviewed_by = auth.uid()
    where id = p_submission_id;

  insert into public.mission_review_events (submission_id, actor_type, actor_id, action, reason_category, reason_text)
    values (p_submission_id, 'ops', auth.uid(), p_action, p_reason_category, p_reason_text);

  perform public.ops_audit_log_append('mission_submission', p_submission_id, 'submission.' || p_action, p_reason_text,
    jsonb_build_object('from', v_status, 'to', v_next_status, 'reason_category', p_reason_category));
end;
$$;

revoke all on function public.admin_review_submission(uuid, text, text, text) from public, anon;
grant execute on function public.admin_review_submission(uuid, text, text, text) to authenticated;
