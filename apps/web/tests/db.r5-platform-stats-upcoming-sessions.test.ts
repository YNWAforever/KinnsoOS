// apps/web/tests/db.r5-platform-stats-upcoming-sessions.test.ts
import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

const sql = readFileSync(
  join(process.cwd(), '../../supabase/migrations/20260707110000_r5_platform_stats_upcoming_sessions.sql'),
  'utf8',
)

describe('R5 platform_stats() upcoming_sessions migration', () => {
  it('drops the old function before recreating it (Postgres cannot CREATE OR REPLACE a changed RETURNS TABLE list)', () => {
    expect(sql).toContain('drop function public.platform_stats()')
  })

  it('recreates platform_stats with upcoming_sessions added to the RETURNS TABLE list', () => {
    expect(sql).toContain('active_creators bigint, published_guides bigint, destinations bigint, completed_bookings bigint, upcoming_sessions bigint')
  })

  it('counts scheduled+live community_sessions rows, not a security-definer helper', () => {
    expect(sql).toMatch(/upcoming_sessions[\s\S]*select count\(\*\) from public\.community_sessions\s+where status in \('scheduled','live'\)/)
    expect(sql).not.toContain('app_private.count_upcoming_sessions')
  })

  it('re-establishes anon/authenticated EXECUTE grants explicitly', () => {
    expect(sql).toContain('revoke all on function public.platform_stats() from public, anon')
    expect(sql).toContain('grant execute on function public.platform_stats() to anon, authenticated')
  })
})
