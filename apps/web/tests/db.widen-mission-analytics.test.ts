import { describe, expect, it } from 'vitest'
import { readFileSync, readdirSync } from 'node:fs'
import { join } from 'node:path'

const dir = join(process.cwd(), '../../supabase/migrations')
const matches = readdirSync(dir).filter((f) => f.endsWith('_r11_0_widen_mission_analytics.sql'))
expect(matches).toHaveLength(1)
const sql = readFileSync(join(dir, matches[0]), 'utf8').toLowerCase().replaceAll(/\s+/gu, ' ')

describe('r11.0 widen admin_mission_analytics', () => {
  it('applies after the RPC migration', () => {
    expect(matches[0] > '20260819090100').toBe(true)
  })

  it('replaces admin_mission_analytics without any mission_source filter', () => {
    expect(sql).toContain('create or replace function public.admin_mission_analytics(p_days int default 30)')
    expect(sql).not.toContain("mission_source = 'merchant'")
  })

  it('keeps the plain is_active_ops gate unchanged (read-only RPC, not widened to is_active_ops_role)', () => {
    expect(sql).toContain('if not public.is_active_ops() then')
  })

  it('keeps every original KPI key present', () => {
    for (const key of ['total', 'by_status', 'by_type', 'by_visibility', 'open_for_applications', 'submissions_awaiting_review']) {
      expect(sql).toContain(`'${key}'`)
    }
  })

  it('does not change the grant/revoke shape', () => {
    expect(sql).toContain('revoke all on function public.admin_mission_analytics(int) from public, anon')
    expect(sql).toContain('grant execute on function public.admin_mission_analytics(int) to authenticated')
  })
})
