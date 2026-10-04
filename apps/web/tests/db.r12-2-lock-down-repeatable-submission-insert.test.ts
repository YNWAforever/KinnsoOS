// apps/web/tests/db.r12-2-lock-down-repeatable-submission-insert.test.ts
import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

const sql = readFileSync(
  join(
    process.cwd(),
    '../../supabase/migrations/20260822090500_r12_2_lock_down_repeatable_submission_insert.sql',
  ),
  'utf8',
)

describe('mission_submissions_creator_insert lock-down', () => {
  it('drops and recreates the same-named policy rather than adding a second one', () => {
    expect(sql).toContain('drop policy "mission_submissions_creator_insert" on public.mission_milestone_submissions')
    expect(sql).toContain('create policy "mission_submissions_creator_insert" on public.mission_milestone_submissions')
  })

  it('preserves the original participant-ownership and active-status check unchanged', () => {
    expect(sql).toContain('from public.mission_participants participant')
    expect(sql).toContain('participant.id = mission_milestone_submissions.mission_participant_id')
    expect(sql).toContain('participant.creator_id = (select auth.uid())')
    expect(sql).toContain("participant.status = 'active'")
  })

  it('adds a new guard requiring the referenced milestone to be non-repeatable', () => {
    expect(sql).toContain('from public.mission_milestones milestone')
    expect(sql).toContain('milestone.id = mission_milestone_submissions.mission_milestone_id')
    expect(sql).toContain('milestone.repeatable = false')
  })

  it('ANDs the new guard onto the existing check rather than OR-ing it (both must hold)', () => {
    // The two `exists (...)` blocks -- participant ownership and milestone non-repeatable --
    // must be joined by `and`, not `or`; an `or` would let either check alone satisfy the
    // policy and reopen the bypass.
    const participantBlockEnd = sql.indexOf('and participant.status = \'active\'')
    const andBetweenBlocks = sql.indexOf('\n    and exists', participantBlockEnd)
    expect(participantBlockEnd).toBeGreaterThan(-1)
    expect(andBetweenBlocks).toBeGreaterThan(participantBlockEnd)
  })

  it('still restricts the policy to the authenticated role for insert', () => {
    expect(sql).toContain('for insert')
    expect(sql).toContain('to authenticated')
  })

  it('explains why this closes the submit_receipt cap-bypass via the SECURITY DEFINER mechanism already used by claim_offer', () => {
    expect(sql).toContain('submit_receipt')
    expect(sql).toContain('SECURITY DEFINER')
    expect(sql).toContain('claim_offer')
    expect(sql).toContain('offer_claims')
  })
})
