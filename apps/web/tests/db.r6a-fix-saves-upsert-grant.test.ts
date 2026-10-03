import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

const sql = readFileSync(
  join(process.cwd(), '../../supabase/migrations/20260706093000_r6a_fix_saves_upsert_grant.sql'),
  'utf8',
)

// This migration's own grant was superseded by 20260706094500, which revokes it
// again: a blanket UPDATE grant let RLS-permitted UPDATEs reassign a save row's
// guide_id/experience_id without the INSERT/DELETE-only count triggers ever
// firing, letting saves_count be inflated without bound. The app no longer
// needs UPDATE at all -- saveGuideAction/saveExperienceAction now upsert with
// `ignoreDuplicates: true` (ON CONFLICT DO NOTHING). This test still verifies
// this migration's own (superseded) text; see
// db.r6a-revoke-saves-update-grant.test.ts for the fix that undoes it.
describe('R6A fix: grant update on guide_saves/experience_saves for upsert (superseded)', () => {
  it('grants update to authenticated on both save tables (needed for INSERT ... ON CONFLICT DO UPDATE)', () => {
    expect(sql).toContain('grant update on public.guide_saves to authenticated')
    expect(sql).toContain('grant update on public.experience_saves to authenticated')
  })
})
