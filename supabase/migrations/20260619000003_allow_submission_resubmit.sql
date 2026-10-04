-- Allow a creator to resubmit a milestone after the merchant requested a revision.
-- Only change vs 20260617173932: the prior-status guard for creator UPDATEs now
-- permits 'revision_requested' (in addition to 'pending','submitted'). Review-field
-- tampering and reviewed-status writes remain blocked.
create or replace function app_private.enforce_mission_submission_integrity()
returns trigger
language plpgsql
set search_path = public
as $$
declare
  actor_id uuid := auth.uid();
  participant_creator_id uuid;
  participant_status text;
  participant_mission_id uuid;
  milestone_mission_id uuid;
begin
  select participant.creator_id, participant.status, participant.mission_id, milestone.mission_id
  into participant_creator_id, participant_status, participant_mission_id, milestone_mission_id
  from public.mission_participants participant
  join public.mission_milestones milestone on milestone.id = new.mission_milestone_id
  where participant.id = new.mission_participant_id;

  if participant_creator_id is null then
    raise exception 'Invalid mission participant or milestone';
  end if;

  if participant_mission_id <> milestone_mission_id then
    raise exception 'Mission milestone and participant mismatch';
  end if;

  if actor_id is not null and actor_id = participant_creator_id then
    if participant_status <> 'active' then
      raise exception 'Creator submissions require an active participant';
    end if;

    if new.status not in ('pending','submitted') then
      raise exception 'Creators cannot set reviewed submission status';
    end if;

    if tg_op = 'INSERT' then
      if new.merchant_feedback is not null or new.reviewed_at is not null or new.reviewed_by is not null then
        raise exception 'Creators cannot set review fields';
      end if;
    elsif old.status not in ('pending','submitted','revision_requested') then
      raise exception 'Creators cannot update reviewed submissions';
    elsif new.merchant_feedback is distinct from old.merchant_feedback
      or new.reviewed_at is distinct from old.reviewed_at
      or new.reviewed_by is distinct from old.reviewed_by then
      raise exception 'Creators cannot update review fields';
    end if;
  end if;

  return new;
end;
$$;
