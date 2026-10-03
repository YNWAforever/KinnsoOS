-- R12.2: adds the schema foundation for repeatable receipt-cashback missions.
--
-- missions.mission_type: 'receipt_cashback' joins the existing coupon_affiliate/hybrid/paid
-- set. paid_fee_amount/paid_fee_currency (already on missions) are reused as the flat
-- per-receipt cashback amount -- no new amount column needed.
--
-- missions.max_receipts_per_creator: optional per-mission cap on how many receipts one
-- creator may get approved, since there's no OCR/auto-matching in v1 -- a human reviewer is
-- the only fraud check. Nullable (off by default); when set, must be >= 1.
--
-- mission_milestones.repeatable: a repeatable milestone (used only by receipt_cashback
-- missions, exactly one per mission, auto-created at mission-creation time) can be submitted
-- against many times by the same participant, unlike every other milestone today.
--
-- mission_milestone_submissions.milestone_repeatable: denormalized copy of the owning
-- milestone's `repeatable` flag, set once at insert time by a trigger and never updated
-- after. This exists because Postgres partial-index predicates can only reference columns of
-- the indexed table itself, not a joined table -- so the "one submission per (milestone,
-- participant) unless repeatable" rule can't be expressed as a partial index directly against
-- mission_milestones.repeatable. Denormalizing the flag onto the submission row at insert
-- time keeps the uniqueness guarantee as a real, enforced index rather than an RPC-only
-- convention.

alter table public.missions
  drop constraint missions_mission_type_check,
  add constraint missions_mission_type_check check (mission_type in ('coupon_affiliate', 'hybrid', 'paid', 'receipt_cashback')),
  add column max_receipts_per_creator integer check (max_receipts_per_creator is null or max_receipts_per_creator >= 1);

alter table public.mission_milestones
  add column repeatable boolean not null default false;

alter table public.mission_milestone_submissions
  add column milestone_repeatable boolean not null default false;

create or replace function public.set_submission_milestone_repeatable() returns trigger
language plpgsql as $$
begin
  select repeatable into new.milestone_repeatable
    from public.mission_milestones
    where id = new.mission_milestone_id;
  return new;
end;
$$;

create trigger set_submission_milestone_repeatable_trg
  before insert on public.mission_milestone_submissions
  for each row execute function public.set_submission_milestone_repeatable();

-- Postgres truncates auto-generated constraint names to NAMEDATALEN-1 (63) bytes; the naive
-- un-truncated name (…mission_participant_id_key) is NOT what got created for the inline
-- `unique (mission_milestone_id, mission_participant_id)` in 20260617173932_mission_tables.sql
-- -- confirmed against a real local Postgres 16 instance via
-- `select conname from pg_constraint where conrelid = 'public.mission_milestone_submissions'::regclass`,
-- which returned …mission_milestone_id_mission__key (double underscore before "key" from the
-- truncation point landing mid-word). Live-proof (Task 10) caught this: the guessed name below
-- made this migration fail outright on a real `db reset`, before any RPC in this phase could
-- even be exercised.
alter table public.mission_milestone_submissions
  drop constraint mission_milestone_submissions_mission_milestone_id_mission__key;

create unique index mission_milestone_submissions_unique_non_repeatable
  on public.mission_milestone_submissions (mission_milestone_id, mission_participant_id)
  where not milestone_repeatable;

-- A receipt_cashback mission has exactly one repeatable milestone, always -- creating it
-- automatically at mission-insert time (rather than leaving it to the merchant-creation UI,
-- a later task) guarantees a later submit_receipt RPC always finds one to submit against,
-- regardless of which path created the mission row (merchant UI, ops, or a direct
-- test/seed insert). Mirrors this codebase's established "X always happens via trigger"
-- pattern (handle_new_user() auto-creating a creators row on signup).
create or replace function public.create_repeatable_milestone_for_receipt_mission() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if new.mission_type = 'receipt_cashback' then
    insert into public.mission_milestones (mission_id, title, description, repeatable)
      values (new.id, 'Submit a receipt', 'Upload a photo of your receipt from this merchant.', true);
  end if;
  return new;
end;
$$;

create trigger create_repeatable_milestone_for_receipt_mission_trg
  after insert on public.missions
  for each row execute function public.create_repeatable_milestone_for_receipt_mission();

-- Code review finding: mission_milestones.repeatable and
-- mission_milestone_submissions.milestone_repeatable are both meant to be set once at
-- creation and never change -- repeatable is set once at milestone-INSERT time (either by
-- application code creating a normal milestone with the default false, or by
-- create_repeatable_milestone_for_receipt_mission_trg above explicitly inserting true for a
-- receipt-cashback mission), and milestone_repeatable is set once at submission-INSERT time
-- purely by set_submission_milestone_repeatable_trg above. Nothing in this codebase ever
-- needs to UPDATE either column. If either flag were flipped on an existing row after
-- creation, already-denormalized mission_milestone_submissions.milestone_repeatable copies
-- for that milestone would silently desync from mission_milestones.repeatable, and the
-- partial unique index mission_milestone_submissions_unique_non_repeatable (`where not
-- milestone_repeatable`) would stop meaning what its name implies for that milestone.
--
-- Both tables carry pre-existing blanket `grant select, insert, update on ... to
-- authenticated` (20260617173941_mission_grants.sql), and their RLS UPDATE policies
-- (mission_milestones_merchant_ops_update, mission_submissions_creator_merchant_ops_update)
-- restrict which rows an owning merchant or active ops member may touch, never which
-- columns -- so today any such actor can run `update mission_milestones set repeatable = ...`
-- (or the submissions equivalent) and it succeeds at the DB layer.
--
-- The obvious-looking fix -- a column-level REVOKE UPDATE targeting just the repeatable /
-- milestone_repeatable column, layered on top of the existing table-level grant -- was
-- tried and rejected after verifying against Postgres's actual ACL semantics (confirmed
-- empirically against a real Postgres 16 instance, not just from memory): a column-level
-- REVOKE only removes column-level ACL entries. Access is granted if EITHER the table-level
-- ACL permits the privilege OR the column-level ACL does (they're additive, not one
-- overriding the other) -- see the PostgreSQL GRANT documentation's description of
-- column-level privileges as supplementing, not narrowing, a table-level grant. Since both
-- tables already carry a blanket table-level `grant update` covering all columns including
-- these two, a column-level revoke on top of that grant is a silent no-op: it does not
-- appear in \dp's "Column privileges" (nothing was ever granted at the column level to
-- revoke), and `update mission_milestones set repeatable = ...` continues to succeed
-- unchanged for any authenticated role. Shipping that revoke would look like a fix in the
-- migration diff while leaving the actual gap wide open.
--
-- Enforcing this at the row level via BEFORE UPDATE triggers -- the same technique this
-- migration set (app_private.enforce_mission_submission_integrity(),
-- 20260617173932_mission_tables.sql:195-249) already uses for other per-actor field
-- restrictions on mission_milestone_submissions -- correctly blocks the mutation regardless
-- of which role or RLS-permitted row is doing the UPDATE, and needs no column enumeration
-- that would go stale as columns are added.
create or replace function app_private.enforce_mission_milestone_repeatable_immutable()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if new.repeatable is distinct from old.repeatable then
    raise exception 'mission_milestones.repeatable is immutable after creation';
  end if;

  return new;
end;
$$;

create trigger mission_milestones_repeatable_immutable_trg
  before update on public.mission_milestones
  for each row execute function app_private.enforce_mission_milestone_repeatable_immutable();

create or replace function app_private.enforce_submission_milestone_repeatable_immutable()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if new.milestone_repeatable is distinct from old.milestone_repeatable then
    raise exception 'mission_milestone_submissions.milestone_repeatable is immutable after creation';
  end if;

  return new;
end;
$$;

create trigger mission_milestone_submissions_repeatable_immutable_trg
  before update on public.mission_milestone_submissions
  for each row execute function app_private.enforce_submission_milestone_repeatable_immutable();

revoke all on function app_private.enforce_mission_milestone_repeatable_immutable() from public;
revoke all on function app_private.enforce_submission_milestone_repeatable_immutable() from public;
