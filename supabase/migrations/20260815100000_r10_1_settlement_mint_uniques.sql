-- R10.1: make a duplicate settlement impossible before anything starts minting them.
--
-- public.mission_settlements has no unique constraint at all today: the only index on
-- affiliate_network_event_id is mission_settlements_affiliate_event_idx, a plain btree
-- (20260617173932:308). Postgres requires a UNIQUE index to infer an ON CONFLICT target,
-- so without this migration the minting triggers in 20260815100100 / 20260815100200 would
-- either error or duplicate money rows on cron replay.
--
-- Two indexes because there are two independent identities:
--   * an affiliate settlement is one-per-event;
--   * a mission-fee settlement is one-per-participant, and must be scoped to rows with no
--     affiliate event, or a creator holding both an affiliate conversion and a mission fee
--     on the same participation would have the second insert blocked by the first.
--
-- Both are partial, so every ON CONFLICT that targets them must repeat the predicate
-- verbatim — Postgres cannot infer a partial index otherwise.
--
-- The pre-checks raise rather than delete. Nothing has ever written this table (verified:
-- zero `insert into public.mission_settlements` across all migrations and app code), so
-- duplicates are not expected — but if any exist, an operator must decide which row is
-- real. A migration must never silently discard a money row.

do $$
declare v_dupes bigint;
begin
  select count(*) into v_dupes from (
    select affiliate_network_event_id
    from public.mission_settlements
    where affiliate_network_event_id is not null
    group by affiliate_network_event_id having count(*) > 1
  ) d;
  if v_dupes > 0 then
    raise exception
      'R10.1: % affiliate_network_event_id value(s) already have more than one mission_settlements row. Resolve them manually before applying this migration.',
      v_dupes;
  end if;

  select count(*) into v_dupes from (
    select mission_participant_id
    from public.mission_settlements
    where affiliate_network_event_id is null and mission_participant_id is not null
    group by mission_participant_id having count(*) > 1
  ) d;
  if v_dupes > 0 then
    raise exception
      'R10.1: % mission_participant_id value(s) already have more than one non-affiliate mission_settlements row. Resolve them manually before applying this migration.',
      v_dupes;
  end if;
end $$;

create unique index if not exists mission_settlements_affiliate_event_uniq
  on public.mission_settlements (affiliate_network_event_id)
  where affiliate_network_event_id is not null;

create unique index if not exists mission_settlements_participant_fee_uniq
  on public.mission_settlements (mission_participant_id)
  where affiliate_network_event_id is null and mission_participant_id is not null;

-- mission_settlements_affiliate_event_idx is deliberately left in place. It is redundant
-- with the new unique index for lookups, but dropping a shipped index is a separate,
-- reversible decision that does not belong in a migration whose job is adding a constraint.
