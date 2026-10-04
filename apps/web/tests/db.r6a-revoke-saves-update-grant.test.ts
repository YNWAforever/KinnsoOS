import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

const sql = readFileSync(
  join(process.cwd(), '../../supabase/migrations/20260706094500_r6a_revoke_saves_update_grant.sql'),
  'utf8',
)

describe('R6A fix: revoke the update grant on guide_saves/experience_saves', () => {
  it('revokes update from authenticated on both save tables', () => {
    expect(sql).toContain('revoke update on public.guide_saves from authenticated')
    expect(sql).toContain('revoke update on public.experience_saves from authenticated')
  })
})
