// apps/web/tests/db.r6b-drop-orphaned-destination-tags-index.test.ts
import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

const sql = readFileSync(
  join(process.cwd(), '../../supabase/migrations/20260711130000_r6b_drop_orphaned_destination_tags_index.sql'),
  'utf8',
)

describe('R6B drop orphaned destination_tags index migration', () => {
  it('drops the now-unused raw-destination_tags GIN index (superseded by destination_tags_ci)', () => {
    expect(sql).toContain('drop index if exists public.community_sessions_destination_tags_idx')
  })
})
