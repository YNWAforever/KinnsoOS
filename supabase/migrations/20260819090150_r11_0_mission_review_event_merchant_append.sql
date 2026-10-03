-- supabase/migrations/20260819090150_r11_0_mission_review_event_merchant_append.sql
--
-- R11.0: mission_review_events (see 20260819090000) has NO insert grant to any client
-- role -- `revoke all on public.mission_review_events from public, anon, authenticated`
-- plus a select-only grant. The only write paths are SECURITY DEFINER functions.
-- admin_review_submission (20260819090100) is that path for ops; this is the equivalent
-- for the merchant-side review action (apps/web/lib/missions/actions.ts's
-- reviewSubmissionAction), which already has raw RLS write access to
-- mission_milestone_submissions but, like ops, needs an audited insert path here.
--
-- Ownership check mirrors mission_review_events_select's own merchant branch exactly
-- (same join chain: mission_participants -> missions -> merchant_profiles), rather than
-- re-deriving it, so "who may write" and "who may read" agree by construction.
--
-- Deliberately narrower than admin_review_submission: this function does NOT touch
-- mission_milestone_submissions.status (reviewSubmissionAction already does that CAS
-- update itself, directly, via RLS) and takes no p_reason_category -- merchants don't
-- pick a review reason category, that's ops-only per the R11.0 design (matches
-- reviewSubmissionAction's own reason_category: null).

create or replace function public.mission_review_event_append(
  p_submission_id uuid,
  p_action text,
  p_reason_text text default null
)
returns void
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  v_is_owner boolean;
begin
  select exists (
    select 1
    from public.mission_milestone_submissions sub
    join public.mission_participants p on p.id = sub.mission_participant_id
    join public.missions m on m.id = p.mission_id
    join public.merchant_profiles mp on mp.id = m.merchant_profile_id
    where sub.id = p_submission_id and mp.user_id = auth.uid()
  ) into v_is_owner;

  if not v_is_owner then
    raise exception 'forbidden' using errcode = '42501';
  end if;

  if p_action not in ('approve', 'reject', 'request_revision') then
    raise exception 'bad_action';
  end if;

  insert into public.mission_review_events (submission_id, actor_type, actor_id, action, reason_category, reason_text)
    values (p_submission_id, 'merchant', auth.uid(), p_action, null, p_reason_text);
end;
$$;

revoke all on function public.mission_review_event_append(uuid, text, text) from public, anon;
grant execute on function public.mission_review_event_append(uuid, text, text) to authenticated;
