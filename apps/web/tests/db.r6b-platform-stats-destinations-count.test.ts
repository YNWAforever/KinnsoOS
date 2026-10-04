// apps/web/tests/db.r6b-platform-stats-destinations-count.test.ts
import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

const sql = readFileSync(
  join(process.cwd(), '../../supabase/migrations/20260709100000_r6b_platform_stats_destinations_count.sql'),
  'utf8',
)

describe('R6B platform_stats() destinations-count migration', () => {
  it('does not drop the function (column list is unchanged, only a body expression changes)', () => {
    expect(sql).not.toContain('drop function')
    expect(sql).toContain('create or replace function public.platform_stats()')
  })

  it('keeps the 5-column RETURNS TABLE list unchanged', () => {
    expect(sql).toContain('active_creators bigint, published_guides bigint, destinations bigint, completed_bookings bigint, upcoming_sessions bigint')
  })

  it('counts published destinations rows instead of distinct guide cities', () => {
    expect(sql).toMatch(/destinations bigint,[\s\S]*select count\(\*\) from public\.destinations where status = 'published'/)
    expect(sql).not.toContain('count(distinct city) from public.guides')
  })

  it('re-establishes anon/authenticated EXECUTE grants explicitly', () => {
    expect(sql).toContain('revoke all on function public.platform_stats() from public, anon')
    expect(sql).toContain('grant execute on function public.platform_stats() to anon, authenticated')
  })
})
