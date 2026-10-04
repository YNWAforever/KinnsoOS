import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

// Executable contract on the R1B migration (same string-assert pattern as
// tests/design.k2-tokens.test.ts): unit tests mock Supabase, so this file is
// what pins the SQL the controller will apply via MCP apply_migration.
const sql = readFileSync(
  join(process.cwd(), '../../supabase/migrations/20260702120000_r1b_platform_stats_testimonials.sql'),
  'utf8',
)

describe('platform_stats() RPC', () => {
  it('is a SECURITY INVOKER aggregate with a pinned search_path', () => {
    expect(sql).toContain('create or replace function public.platform_stats()')
    expect(sql).toContain('security invoker')
    expect(sql).toContain('set search_path = public')
  })
  it('counts active public creators, published guides, and distinct guide cities', () => {
    expect(sql).toContain("status = 'active' and handle is not null and public_profile is not null")
    expect(sql).toContain("from public.guides where status = 'published'")
    expect(sql).toContain('count(distinct city)')
  })
  it('is executable by anon (public homepage read) and carries NO bookings stat until R3', () => {
    expect(sql).toContain('grant execute on function public.platform_stats() to anon, authenticated')
    expect(sql.toLowerCase()).toMatch(/returns table\s*\(/)
    expect(sql.toLowerCase()).not.toContain('bookings bigint')
  })
})

describe('testimonials table', () => {
  it('has the locked columns and check constraints', () => {
    expect(sql).toContain('create table if not exists public.testimonials')
    expect(sql).toContain('id uuid primary key default gen_random_uuid()')
    expect(sql).toContain('quote text not null')
    expect(sql).toContain('author_name text not null')
    expect(sql).toContain("author_role text not null check (author_role in ('creator','traveller','merchant'))")
    expect(sql).toContain("status text not null default 'draft' check (status in ('draft','published'))")
    expect(sql).toContain("check (locale is null or locale in ('en','zh-hk','zh-tw','zh-cn','ja','ko','th'))")
    expect(sql).toContain('sort_order int not null default 0')
  })
  it('is RLS-locked: anon reads published only; ops manage all', () => {
    expect(sql).toContain('alter table public.testimonials enable row level security')
    expect(sql).toContain('revoke all on public.testimonials from anon, authenticated')
    expect(sql).toContain("for select to anon, authenticated using (status = 'published')")
    expect(sql).toContain('using (public.is_active_ops()) with check (public.is_active_ops())')
  })
})
