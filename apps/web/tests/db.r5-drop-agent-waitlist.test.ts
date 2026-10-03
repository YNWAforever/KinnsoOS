// apps/web/tests/db.r5-drop-agent-waitlist.test.ts
import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

const sql = readFileSync(
  join(process.cwd(), '../../supabase/migrations/20260707120000_r5_drop_agent_waitlist.sql'),
  'utf8',
)

describe('R5 drop agent_waitlist migration', () => {
  it('drops the table (0 live rows, no consumer since R4 removed the app code)', () => {
    expect(sql).toContain('drop table if exists public.agent_waitlist')
  })
})
