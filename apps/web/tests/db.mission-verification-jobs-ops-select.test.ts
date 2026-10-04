import { describe, expect, it } from 'vitest'
import { readFileSync, readdirSync } from 'node:fs'
import { join } from 'node:path'

const dir = join(process.cwd(), '../../supabase/migrations')
const matches = readdirSync(dir).filter((f) => f.endsWith('_r11_1_mission_verification_jobs_ops_select.sql'))
expect(matches).toHaveLength(1)
const sql = readFileSync(join(dir, matches[0]), 'utf8').toLowerCase().replaceAll(/\s+/gu, ' ')

describe('r11.1 mission_verification_jobs ops SELECT policy', () => {
  it('applies after R11.0 migrations', () => {
    expect(matches[0] > '20260819090200').toBe(true)
  })

  it('adds a second permissive SELECT policy scoped to an active ops member', () => {
    expect(sql).toContain('create policy mission_verification_jobs_ops_select on public.mission_verification_jobs')
    expect(sql).toContain('for select')
    expect(sql).toContain('to authenticated')
    expect(sql).toContain('exists ( select 1 from public.kinnso_ops_members ops where ops.user_id = (select auth.uid()) and ops.status = \'active\' )')
  })

  it('is PERMISSIVE, not RESTRICTIVE -- a restrictive policy would AND with the existing owner policy instead of ORing, silently denying ops reads', () => {
    // The four toContain() checks above are independent substrings, so an `as restrictive`
    // inserted between `on public.mission_verification_jobs` and `for select` would still
    // pass every one of them -- this is the one check that actually rules that out.
    expect(sql).not.toContain('as restrictive')
  })

  it('does not touch or drop the existing owner policy', () => {
    expect(sql).not.toContain('drop policy')
    expect(sql).not.toContain('mission_verification_jobs_owner_select')
  })
})
