// apps/web/tests/db.r4-bookings-agent-source-surface.test.ts
import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

const sql = readFileSync(
  join(process.cwd(), '../../supabase/migrations/20260705130000_r4_bookings_agent_source_surface.sql'),
  'utf8',
)

describe('bookings.source_surface gains agent', () => {
  it('drops and recreates the CHECK constraint including agent', () => {
    expect(sql).toContain('alter table public.bookings drop constraint')
    expect(sql).toContain("check (source_surface in ('guide','article','experience_page','direct','agent'))")
  })
})
