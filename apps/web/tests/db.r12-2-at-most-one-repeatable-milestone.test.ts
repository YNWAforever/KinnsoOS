// apps/web/tests/db.r12-2-at-most-one-repeatable-milestone.test.ts
import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

const sql = readFileSync(
  join(process.cwd(), '../../supabase/migrations/20260822090600_r12_2_at_most_one_repeatable_milestone.sql'),
  'utf8',
)

describe('R12.2 at-most-one-repeatable-milestone guard', () => {
  it('adds a partial unique index enforcing at most one repeatable milestone per mission', () => {
    expect(sql).toContain('create unique index mission_milestones_one_repeatable_per_mission')
    expect(sql).toContain('on public.mission_milestones (mission_id)')
    expect(sql).toContain('where repeatable;')
  })

  it('tightens the merchant/ops insert policy to require receipt_cashback for a repeatable milestone', () => {
    expect(sql).toContain('drop policy "mission_milestones_merchant_ops_insert" on public.mission_milestones')
    expect(sql).toContain('create policy "mission_milestones_merchant_ops_insert" on public.mission_milestones')
    expect(sql).toContain('not mission_milestones.repeatable')
    expect(sql).toContain("mission.mission_type = 'receipt_cashback'")
  })

  it('preserves the existing ownership check unchanged', () => {
    expect(sql).toContain('merchant.user_id = (select auth.uid())')
    expect(sql).toContain("ops.user_id = (select auth.uid()) and ops.status = 'active'")
  })
})
