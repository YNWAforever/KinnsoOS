import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

const sql = readFileSync(
  join(process.cwd(), '../../supabase/migrations/20260822090200_r12_2_settle_receipt_on_approval.sql'),
  'utf8',
)

// Negative assertions run against comment-stripped SQL, matching the established pattern
// (tests/db.r12-2-settlements-receipt-source.test.ts, tests/db.backfill-affiliate-settlements.test.ts)
// since this migration's own explanatory comments legitimately name things like
// "DROP FUNCTION" while explaining why one isn't needed here.
const sqlNoComments = sql
  .split('\n')
  .filter((line) => !line.trim().startsWith('--'))
  .join(' ')

describe('create_mission_settlement_on_approval receipt_cashback branch', () => {
  it('does not change the function signature (no DROP FUNCTION needed)', () => {
    expect(sqlNoComments.toLowerCase()).not.toContain('drop function')
    expect(sql).toContain('create or replace function public.create_mission_settlement_on_approval()')
  })

  it('mints a receipt_cashback settlement tagged with the submission id', () => {
    expect(sql).toContain("elsif v_mission_type = 'receipt_cashback' then")
    expect(sql).toContain('mission_milestone_submission_id')
    expect(sql).toContain('new.id,')
    expect(sql).toContain("'receipt_cashback'\n    )")
  })

  it('uses the submission-scoped arbiter for receipt_cashback, not the participant-scoped one', () => {
    expect(sql).toContain("on conflict (mission_milestone_submission_id) where source = 'receipt_cashback'")
  })

  it('preserves the existing paid/hybrid branch and its original participant-scoped arbiter unchanged', () => {
    expect(sql).toContain("if v_mission_type in ('paid', 'hybrid') then")
    expect(sql).toContain(
      "on conflict (mission_participant_id) where affiliate_network_event_id is null and mission_participant_id is not null and source = 'mission_fee'",
    )
  })

  it('preserves the already-approved short-circuit guard and the merchant-source guard', () => {
    expect(sql).toContain("if tg_op = 'update' and coalesce(old.status, '') = 'approved' then return new; end if;")
    expect(sql).toContain("if v_source <> 'merchant' then return new; end if;")
  })

  it('no longer has the old blanket paid/hybrid-only early-return, which would have blocked receipt_cashback', () => {
    expect(sqlNoComments).not.toContain("if v_mission_type not in ('paid','hybrid') then return new; end if;")
  })
})
