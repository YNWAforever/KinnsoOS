-- supabase/migrations/20260817090100_r10_3_notification_triggers.sql
--
-- R10.3 (reduced scope, see plan amendment 2026-08-18): two trigger functions covering four
-- notification types (submission approved/rejected/revision_requested, settlement created).
-- The third trigger (payout_batch.created/paid/cancelled) is deliberately deferred to a
-- separate Task 2b migration, since the payout-batches table it depends on does not exist on
-- this branch yet (it ships in R10.2, still unmerged as of this migration).
--
-- Every insert into notifications is wrapped in its own begin/exception block, per Adfocate
-- 0022's "NEVER roll back the earn loop": a notification failing to write must never fail the
-- submission review or settlement creation that triggered it. The block is scoped to JUST the
-- insert, not the whole function body, so a bug in creator-resolution logic above the insert
-- still surfaces loudly rather than being silently swallowed too.

create or replace function public.notify_submission_status_change() returns trigger
language plpgsql security definer set search_path = public as $$
declare
  v_creator_id uuid;
  v_mission_id uuid;
  v_mission_title text;
  v_type text;
begin
  if new.status is not distinct from old.status then return new; end if;
  if new.status not in ('approved', 'rejected', 'revision_requested') then return new; end if;

  select p.creator_id, m.id, m.title
    into v_creator_id, v_mission_id, v_mission_title
    from public.mission_participants p
    join public.mission_milestones ms on ms.id = new.mission_milestone_id
    join public.missions m on m.id = ms.mission_id
    where p.id = new.mission_participant_id;

  if v_creator_id is null then return new; end if;

  v_type := case new.status
    when 'approved' then 'submission.approved'
    when 'rejected' then 'submission.rejected'
    else 'submission.revision_requested'
  end;

  begin
    insert into public.notifications (creator_id, notification_type, entity_type, entity_id, payload)
    values (v_creator_id, v_type, 'mission', v_mission_id, jsonb_build_object('mission_title', v_mission_title));
  exception when others then null;
  end;

  return new;
end;
$$;

create trigger notify_submission_status_change_trg
  after update on public.mission_milestone_submissions
  for each row execute function public.notify_submission_status_change();

revoke all on function public.notify_submission_status_change() from public, anon, authenticated, service_role;

create or replace function public.notify_settlement_created() returns trigger
language plpgsql security definer set search_path = public as $$
declare
  v_creator_id uuid;
  v_mission_title text;
begin
  select p.creator_id, m.title
    into v_creator_id, v_mission_title
    from public.mission_participants p
    join public.missions m on m.id = new.mission_id
    where p.id = new.mission_participant_id;

  if v_creator_id is null then return new; end if;

  begin
    insert into public.notifications (creator_id, notification_type, entity_type, entity_id, payload)
    values (v_creator_id, 'settlement.created', 'mission_settlement', new.id,
      jsonb_build_object('mission_title', v_mission_title, 'currency', upper(coalesce(new.amount_currency, 'USD'))));
  exception when others then null;
  end;

  return new;
end;
$$;

create trigger notify_settlement_created_trg
  after insert on public.mission_settlements
  for each row execute function public.notify_settlement_created();

revoke all on function public.notify_settlement_created() from public, anon, authenticated, service_role;
