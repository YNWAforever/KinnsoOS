-- Phase 5A: creator tier & contribution backbone.
-- Real, points-driven tier earned from real activity (published guides, verified
-- missions, completed DNA scan). Append-only event log + SECURITY DEFINER recompute
-- + a creator-private 1:1 projection. NO gating here (5B-5D). Mirrors Phase 3
-- trigger/backfill conventions (20260624000001) and guides grant style.
-- WEIGHTS/THRESHOLDS MIRROR apps/web/lib/contribution/tiers.ts -- keep in sync.

-- 1. Append-only contribution event log.
create table public.creator_contribution_events (
  id          uuid primary key default gen_random_uuid(),
  creator_id  uuid not null references public.creators(id) on delete cascade,
  event_type  text not null check (event_type in ('dna_scan','guide_published','mission_verified')),
  points      int  not null,
  source_id   uuid not null,
  created_at  timestamptz not null default now(),
  unique (creator_id, event_type, source_id)
);
create index creator_contribution_events_creator_idx
  on public.creator_contribution_events (creator_id, created_at desc);

-- 2. Creator-private 1:1 projection. Deliberately NOT columns on `creators`
--    (which anon can read) so tier never leaks to anon.
create table public.creator_contribution (
  creator_id          uuid primary key references public.creators(id) on delete cascade,
  contribution_points int not null default 0,
  tier                text not null default 'seed' check (tier in ('seed','rising','pro','elite')),
  tier_updated_at     timestamptz,
  updated_at          timestamptz not null default now()
);

-- 3. Threshold -> tier (mirrors TIER_THRESHOLDS).
create or replace function public.contribution_tier_for_points(p_points int)
returns text language sql immutable as $$
  select case
    when p_points >= 400 then 'elite'
    when p_points >= 150 then 'pro'
    when p_points >= 50  then 'rising'
    else 'seed'
  end;
$$;

-- 4. Recompute the projection for one creator from the event log (idempotent).
create or replace function public.recompute_creator_contribution(p_creator_id uuid)
returns void language plpgsql security definer set search_path = public as $$
declare
  v_points int;
  v_tier   text;
begin
  select coalesce(sum(points), 0) into v_points
  from public.creator_contribution_events where creator_id = p_creator_id;

  v_tier := public.contribution_tier_for_points(v_points);

  insert into public.creator_contribution (creator_id, contribution_points, tier, tier_updated_at, updated_at)
  values (p_creator_id, v_points, v_tier, now(), now())
  on conflict (creator_id) do update
    set contribution_points = excluded.contribution_points,
        tier = excluded.tier,
        tier_updated_at = case when public.creator_contribution.tier <> excluded.tier
                               then now() else public.creator_contribution.tier_updated_at end,
        updated_at = now();
end;
$$;

-- 5. Award (idempotent) / revoke an event, then recompute. DRY for the triggers.
create or replace function public.award_contribution_event(
  p_creator_id uuid, p_event_type text, p_points int, p_source_id uuid)
returns void language plpgsql security definer set search_path = public as $$
begin
  insert into public.creator_contribution_events (creator_id, event_type, points, source_id)
  values (p_creator_id, p_event_type, p_points, p_source_id)
  on conflict (creator_id, event_type, source_id) do nothing;
  perform public.recompute_creator_contribution(p_creator_id);
end;
$$;

create or replace function public.revoke_contribution_event(
  p_creator_id uuid, p_event_type text, p_source_id uuid)
returns void language plpgsql security definer set search_path = public as $$
begin
  delete from public.creator_contribution_events
  where creator_id = p_creator_id and event_type = p_event_type and source_id = p_source_id;
  perform public.recompute_creator_contribution(p_creator_id);
end;
$$;

-- 6. guides -> guide_published (15). Award on enter-published, revoke on leave/delete.
--    All AFTER triggers: return value ignored. Best-effort: never block the write.
create or replace function public.contribution_on_guide()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  begin
    if (TG_OP = 'INSERT') then
      if new.status = 'published' then
        perform public.award_contribution_event(new.creator_id, 'guide_published', 15, new.id);
      end if;
    elsif (TG_OP = 'UPDATE') then
      if new.status = 'published' and coalesce(old.status,'') <> 'published' then
        perform public.award_contribution_event(new.creator_id, 'guide_published', 15, new.id);
      elsif old.status = 'published' and new.status <> 'published' then
        perform public.revoke_contribution_event(new.creator_id, 'guide_published', new.id);
      end if;
    elsif (TG_OP = 'DELETE') then
      if old.status = 'published' then
        perform public.revoke_contribution_event(old.creator_id, 'guide_published', old.id);
      end if;
    end if;
  exception when others then
    raise warning 'contribution_on_guide failed: %', sqlerrm;
  end;
  return null;
end;
$$;
create trigger guides_contribution
  after insert or update or delete on public.guides
  for each row execute procedure public.contribution_on_guide();

-- 7. creator_dna -> dna_scan (10). One-time per creator (source_id = creator_id).
create or replace function public.contribution_on_dna()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  begin
    if new.status = 'published' and new.final is not null then
      perform public.award_contribution_event(new.creator_id, 'dna_scan', 10, new.creator_id);
    end if;
  exception when others then
    raise warning 'contribution_on_dna failed: %', sqlerrm;
  end;
  return null;
end;
$$;
create trigger creator_dna_contribution
  after insert or update on public.creator_dna
  for each row execute procedure public.contribution_on_dna();

-- 8. mission_milestone_submissions -> mission_verified (40), deduped per MISSION.
--    Award when a submission enters 'approved'; revoke when it leaves and no other
--    approved submission still backs that mission for that creator.
create or replace function public.contribution_on_submission()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  v_creator_id uuid;
  v_mission_id uuid;
  v_remaining  int;
begin
  begin
    select mp.creator_id, ms.mission_id
      into v_creator_id, v_mission_id
    from public.mission_participants mp
    join public.mission_milestones ms on ms.id = new.mission_milestone_id
    where mp.id = new.mission_participant_id;

    if v_creator_id is null or v_mission_id is null then
      return null;
    end if;

    if (TG_OP = 'INSERT') then
      if new.status = 'approved' then
        perform public.award_contribution_event(v_creator_id, 'mission_verified', 40, v_mission_id);
      end if;
    elsif (TG_OP = 'UPDATE') then
      if new.status = 'approved' and coalesce(old.status,'') <> 'approved' then
        perform public.award_contribution_event(v_creator_id, 'mission_verified', 40, v_mission_id);
      elsif old.status = 'approved' and new.status <> 'approved' then
        select count(*) into v_remaining
        from public.mission_milestone_submissions s
        join public.mission_milestones m on m.id = s.mission_milestone_id
        join public.mission_participants p on p.id = s.mission_participant_id
        where m.mission_id = v_mission_id and p.creator_id = v_creator_id
          and s.status = 'approved' and s.id <> new.id;
        if coalesce(v_remaining, 0) = 0 then
          perform public.revoke_contribution_event(v_creator_id, 'mission_verified', v_mission_id);
        end if;
      end if;
    end if;
  exception when others then
    raise warning 'contribution_on_submission failed: %', sqlerrm;
  end;
  return null;
end;
$$;
create trigger submission_contribution
  after insert or update on public.mission_milestone_submissions
  for each row execute procedure public.contribution_on_submission();

-- 9. RLS: owner-read only; writes happen via SECURITY DEFINER functions (bypass RLS).
alter table public.creator_contribution_events enable row level security;
alter table public.creator_contribution enable row level security;

create policy "creator_contribution_events_owner_select" on public.creator_contribution_events
  for select using (creator_id = auth.uid());
create policy "creator_contribution_owner_select" on public.creator_contribution
  for select using (creator_id = auth.uid());

grant select on public.creator_contribution_events to authenticated;
grant select on public.creator_contribution to authenticated;
revoke all on public.creator_contribution_events from anon;
revoke all on public.creator_contribution from anon;

-- 10. Backfill from existing real activity, then recompute everyone with events.
do $$
declare r record;
begin
  for r in select id, creator_id from public.guides where status = 'published' loop
    insert into public.creator_contribution_events (creator_id, event_type, points, source_id)
    values (r.creator_id, 'guide_published', 15, r.id) on conflict do nothing;
  end loop;

  for r in select creator_id from public.creator_dna where status = 'published' and final is not null loop
    insert into public.creator_contribution_events (creator_id, event_type, points, source_id)
    values (r.creator_id, 'dna_scan', 10, r.creator_id) on conflict do nothing;
  end loop;

  for r in
    select distinct mp.creator_id, ms.mission_id
    from public.mission_milestone_submissions s
    join public.mission_participants mp on mp.id = s.mission_participant_id
    join public.mission_milestones ms on ms.id = s.mission_milestone_id
    where s.status = 'approved'
  loop
    insert into public.creator_contribution_events (creator_id, event_type, points, source_id)
    values (r.creator_id, 'mission_verified', 40, r.mission_id) on conflict do nothing;
  end loop;

  for r in select distinct creator_id from public.creator_contribution_events loop
    perform public.recompute_creator_contribution(r.creator_id);
  end loop;
end $$;
