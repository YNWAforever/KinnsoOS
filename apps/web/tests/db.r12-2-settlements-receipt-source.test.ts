import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

const sql = readFileSync(
  join(process.cwd(), '../../supabase/migrations/20260822090100_r12_2_settlements_receipt_source.sql'),
  'utf8',
)

// Negative assertions run against comment-stripped SQL. This migration's own explanatory
// comment deliberately names mission_settlements_participant_fee_uniq (to document that it's
// untouched) -- a bare substring check on the raw file would read that explanation as the
// offence and fail on well-commented SQL. Same pattern as tests/db.backfill-affiliate-settlements.test.ts.
const sqlNoComments = sql
  .split('\n')
  .filter((line) => !line.trim().startsWith('--'))
  .join(' ')

describe('R12.2 mission_settlements receipt_cashback source', () => {
  it('adds a mission_milestone_submission_id column', () => {
    expect(sql).toContain('add column mission_milestone_submission_id uuid references public.mission_milestone_submissions(id)')
  })

  it('widens the source check to add receipt_cashback alongside the existing two values', () => {
    expect(sql).toContain("source in ('mission_fee', 'visit_redemption', 'receipt_cashback')")
  })

  it('adds a submission-scoped unique index, not a participant-scoped one', () => {
    expect(sql).toContain('create unique index mission_settlements_submission_receipt_uniq')
    expect(sql).toContain('on public.mission_settlements (mission_milestone_submission_id)')
    expect(sql).toContain("where source = 'receipt_cashback'")
  })

  it('does not touch the existing participant-scoped mission_fee index', () => {
    expect(sqlNoComments).not.toContain('mission_settlements_participant_fee_uniq')
  })

  it('sets the submission FK to ON DELETE SET NULL, not CASCADE, matching this table\'s own ledger-preserving convention', () => {
    expect(sql).toContain(
      'references public.mission_milestone_submissions(id) on delete set null',
    )
  })
})
