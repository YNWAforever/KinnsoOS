import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

const sql = readFileSync(
  join(process.cwd(), '../../supabase/migrations/20260711062712_r6b_fix_session_destination_tags_ci_backfill.sql'),
  'utf8',
)

describe('R6B fix: destination_tags_ci generated column (case-insensitive match + auto-backfill)', () => {
  it('defines an immutable lowercase_text_array helper used by the generated column', () => {
    expect(sql).toContain('create or replace function public.lowercase_text_array(arr text[])')
    expect(sql).toContain('returns text[]')
    expect(sql).toContain('immutable')
    expect(sql).toMatch(/select coalesce\(array_agg\(lower\(t\)\), '\{\}'::text\[\]\) from unnest\(arr\) as t/)
  })

  it('adds destination_tags_ci as a STORED generated column driven by lowercase_text_array', () => {
    expect(sql).toContain('alter table public.community_sessions')
    expect(sql).toContain('add column destination_tags_ci text[] generated always as (public.lowercase_text_array(destination_tags)) stored')
  })

  it('indexes destination_tags_ci with gin for the overlap match query', () => {
    expect(sql).toContain('create index community_sessions_destination_tags_ci_idx')
    expect(sql).toContain('on public.community_sessions using gin (destination_tags_ci)')
  })

  it('is a STORED generated column, not a trigger or app-layer write, so Postgres backfills every existing row on creation and keeps future rows in sync automatically', () => {
    // Documents the intent this migration exists to satisfy — no manual UPDATE
    // backfill statement is needed precisely because ADD COLUMN ... GENERATED
    // ALWAYS ... STORED computes the value for pre-existing rows immediately.
    expect(sql).not.toMatch(/update\s+public\.community_sessions/i)
    expect(sql).toContain('generated always as')
    expect(sql).toContain('stored')
  })
})
