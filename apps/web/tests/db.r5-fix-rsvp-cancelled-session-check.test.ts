import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

const sql = readFileSync(
  join(process.cwd(), '../../supabase/migrations/20260708100000_r5_fix_rsvp_cancelled_session_check.sql'),
  'utf8',
)

describe('R5 fix: session_rsvps_insert rejects RSVPs to a cancelled session', () => {
  it('drops and recreates session_rsvps_insert', () => {
    expect(sql).toContain('drop policy if exists session_rsvps_insert on public.session_rsvps')
    expect(sql).toContain('create policy session_rsvps_insert on public.session_rsvps')
  })

  it('the new WITH CHECK keeps the NULL-safe identity check and additionally excludes cancelled sessions', () => {
    expect(sql).toContain('(user_id is null or user_id = auth.uid())')
    expect(sql).toMatch(/exists\s*\(\s*select 1 from public\.community_sessions cs\s+where cs\.id = session_rsvps\.session_id and cs\.status <> 'cancelled'\s*\)/)
  })
})
