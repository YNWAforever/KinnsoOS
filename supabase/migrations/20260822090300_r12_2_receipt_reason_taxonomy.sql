-- supabase/migrations/20260822090300_r12_2_receipt_reason_taxonomy.sql
--
-- Receipt-cashback submissions get their own rejection taxonomy
-- (unreadable/wrong_venue/duplicate/amount_unclear) -- R11.0's existing
-- format/key_message/compliance/quality/other set was built for social-post proof and
-- doesn't fit a receipt. A plain column CHECK can't be mission-type-aware (it can't see
-- across the submission -> participant -> mission join), so this widens the CHECK to the
-- union of both taxonomies as a floor, then adds a BEFORE INSERT trigger that enforces the
-- CORRECT taxonomy for the submission's real mission type -- every existing mission type's
-- rejections are completely unaffected (they still only pass with the R11.0 taxonomy; only
-- receipt_cashback submissions can use the new one).

alter table public.mission_review_events
  drop constraint mission_review_events_reason_category_check,
  add constraint mission_review_events_reason_category_check check (
    reason_category is null or reason_category in (
      'format', 'key_message', 'compliance', 'quality', 'other',
      'unreadable', 'wrong_venue', 'duplicate', 'amount_unclear'
    )
  );

create or replace function public.enforce_reason_category_taxonomy() returns trigger
language plpgsql as $$
declare
  v_mission_type text;
begin
  if new.reason_category is null then
    return new;
  end if;

  select m.mission_type into v_mission_type
    from public.mission_milestone_submissions sub
    join public.mission_participants mp on mp.id = sub.mission_participant_id
    join public.missions m on m.id = mp.mission_id
    where sub.id = new.submission_id;

  if v_mission_type = 'receipt_cashback' then
    if new.reason_category not in ('unreadable', 'wrong_venue', 'duplicate', 'amount_unclear', 'other') then
      raise exception 'bad_reason_category_for_receipt_cashback';
    end if;
  else
    if new.reason_category not in ('format', 'key_message', 'compliance', 'quality', 'other') then
      raise exception 'bad_reason_category_for_mission_type';
    end if;
  end if;

  return new;
end;
$$;

create trigger enforce_reason_category_taxonomy_trg
  before insert on public.mission_review_events
  for each row execute function public.enforce_reason_category_taxonomy();

-- admin_review_submission's OWN inline reason-category check runs before the
-- mission_review_events insert ever happens, so it must independently know the same
-- mission-type-aware taxonomy as the trigger above, not just the flat R11.0 list.
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
  v_mission_type text;
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

  select m.mission_type into v_mission_type
    from public.mission_milestone_submissions sub
    join public.mission_participants mp on mp.id = sub.mission_participant_id
    join public.missions m on m.id = mp.mission_id
    where sub.id = p_submission_id;

  if p_reason_category is not null then
    if v_mission_type = 'receipt_cashback' then
      if p_reason_category not in ('unreadable', 'wrong_venue', 'duplicate', 'amount_unclear', 'other') then
        raise exception 'bad_reason_category';
      end if;
    else
      if p_reason_category not in ('format', 'key_message', 'compliance', 'quality', 'other') then
        raise exception 'bad_reason_category';
      end if;
    end if;
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
