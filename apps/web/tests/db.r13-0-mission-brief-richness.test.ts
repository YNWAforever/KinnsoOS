import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

const sql = readFileSync(
  join(process.cwd(), '../../supabase/migrations/20260823090000_r13_0_mission_brief_richness.sql'),
  'utf8',
)

describe('R13.0 mission brief richness schema', () => {
  it('adds six empty-array-default text[] columns for the brief lists', () => {
    expect(sql).toContain("add column deliverables text[] not null default '{}'")
    expect(sql).toContain("add column requirements text[] not null default '{}'")
    expect(sql).toContain("add column dos text[] not null default '{}'")
    expect(sql).toContain("add column donts text[] not null default '{}'")
    expect(sql).toContain("add column key_messages text[] not null default '{}'")
    expect(sql).toContain("add column reference_links text[] not null default '{}'")
  })

  it('adds a nullable effort enum constrained to low/medium/high', () => {
    expect(sql).toContain('add column effort text')
    expect(sql).toContain("check (effort in ('low', 'medium', 'high'))")
  })

  it('alters the existing missions table, not a new one', () => {
    expect(sql).toContain('alter table public.missions')
  })
})
