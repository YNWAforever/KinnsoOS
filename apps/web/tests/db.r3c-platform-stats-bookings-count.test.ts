import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

const sql = readFileSync(
  join(process.cwd(), '../../supabase/migrations/20260705090000_r3c_platform_stats_bookings_count.sql'),
  'utf8',
)

describe('app_private.count_completed_bookings()', () => {
  it('is a SECURITY DEFINER helper with a pinned search_path, revoked from public then explicitly granted', () => {
    expect(sql).toContain('create or replace function app_private.count_completed_bookings()')
    expect(sql).toContain('security definer')
    expect(sql).toContain('set search_path = public')
    expect(sql).toContain('revoke all on function app_private.count_completed_bookings() from public')
    expect(sql).toContain('grant execute on function app_private.count_completed_bookings() to anon, authenticated')
  })
  it('counts only completed bookings', () => {
    expect(sql).toContain("select count(*) from public.bookings where status = 'completed'")
  })
})

describe('platform_stats() — R3C addition', () => {
  it('drops the existing function first, since Postgres cannot change RETURNS TABLE shape via CREATE OR REPLACE', () => {
    expect(sql).toContain('drop function if exists public.platform_stats()')
  })
  it('stays SECURITY INVOKER and gains a fourth completed_bookings column via the new helper', () => {
    expect(sql).toContain('create or replace function public.platform_stats()')
    expect(sql).toContain('security invoker')
    expect(sql.toLowerCase()).toMatch(/returns table\s*\(\s*active_creators bigint,\s*published_guides bigint,\s*destinations bigint,\s*completed_bookings bigint\s*\)/)
    expect(sql).toContain('app_private.count_completed_bookings()')
  })
  it('keeps the three existing counts byte-for-byte (never touch a shipped column)', () => {
    expect(sql).toContain("status = 'active' and handle is not null and public_profile is not null")
    expect(sql).toContain("from public.guides where status = 'published'")
    expect(sql).toContain('count(distinct city)')
  })
})
