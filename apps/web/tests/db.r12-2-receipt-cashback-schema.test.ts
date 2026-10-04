import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

const sql = readFileSync(
  join(process.cwd(), '../../supabase/migrations/20260822090000_r12_2_receipt_cashback_schema.sql'),
  'utf8',
)

describe('R12.2 receipt-cashback schema foundation', () => {
  it('adds receipt_cashback to mission_type and a nullable max_receipts_per_creator cap', () => {
    expect(sql).toContain("mission_type in ('coupon_affiliate', 'hybrid', 'paid', 'receipt_cashback')")
    expect(sql).toContain('add column max_receipts_per_creator integer')
  })

  it('adds a repeatable flag to mission_milestones', () => {
    expect(sql).toContain('add column repeatable boolean not null default false')
  })

  it('denormalizes milestone_repeatable onto submissions via a before-insert trigger', () => {
    expect(sql).toContain('add column milestone_repeatable boolean not null default false')
    expect(sql).toContain('before insert on public.mission_milestone_submissions')
    expect(sql).toContain('select repeatable into new.milestone_repeatable')
  })

  it('replaces the flat unique constraint with a partial index scoped to non-repeatable milestones', () => {
    expect(sql).toContain('drop constraint')
    expect(sql).toContain('create unique index mission_milestone_submissions_unique_non_repeatable')
    expect(sql).toContain('on public.mission_milestone_submissions (mission_milestone_id, mission_participant_id)')
    expect(sql).toContain('where not milestone_repeatable')
  })

  it('auto-creates a repeatable milestone whenever a receipt_cashback mission is inserted', () => {
    expect(sql).toContain('after insert on public.missions')
    expect(sql).toContain("if new.mission_type = 'receipt_cashback' then")
    expect(sql).toContain('insert into public.mission_milestones (mission_id, title, description, repeatable)')
    expect(sql).toContain('true);')
  })

  // Code review found that mission_milestones and mission_milestone_submissions both carry
  // pre-existing blanket `grant ... update ... to authenticated` (20260617173941_mission_grants.sql)
  // plus row-scoped-only RLS UPDATE policies, so nothing stopped an owning merchant/ops actor
  // from flipping repeatable/milestone_repeatable after creation and desyncing the
  // denormalized copy. A column-level `revoke update (col) on ... from authenticated` looks
  // like the obvious fix but is a no-op here: Postgres ACL checks are the OR of the
  // table-level grant and the column-level grant, so a pre-existing table-level `grant
  // update` (covering all columns) keeps authorizing the column update regardless of any
  // column-level revoke layered on top (verified empirically against a real Postgres 16
  // instance). The actual fix is BEFORE UPDATE triggers that reject any change to either
  // flag, mirroring the enforce_mission_submission_integrity() pattern already used
  // elsewhere in this schema for per-actor field restrictions.
  it('blocks any UPDATE to mission_milestones.repeatable via a BEFORE UPDATE trigger, not a column-level grant/revoke', () => {
    expect(sql).toContain('before update on public.mission_milestones')
    expect(sql).toContain('if new.repeatable is distinct from old.repeatable then')
    expect(sql).toContain("raise exception 'mission_milestones.repeatable is immutable after creation'")
    // A column-level REVOKE would be a silent no-op against the pre-existing table-level
    // `grant ... update ... to authenticated` -- assert it was NOT used as the mechanism.
    expect(sql).not.toContain('revoke update (repeatable)')
  })

  it('blocks any UPDATE to mission_milestone_submissions.milestone_repeatable via a BEFORE UPDATE trigger, not a column-level grant/revoke', () => {
    expect(sql).toContain('before update on public.mission_milestone_submissions')
    expect(sql).toContain('if new.milestone_repeatable is distinct from old.milestone_repeatable then')
    expect(sql).toContain(
      "raise exception 'mission_milestone_submissions.milestone_repeatable is immutable after creation'",
    )
    expect(sql).not.toContain('revoke update (milestone_repeatable)')
  })
})
