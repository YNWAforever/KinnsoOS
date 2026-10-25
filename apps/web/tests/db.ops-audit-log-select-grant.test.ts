import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

const sql = readFileSync(
  join(process.cwd(), '../../supabase/migrations/20261025140000_grant_ops_audit_log_select.sql'),
  'utf8',
)

describe('ops_audit_log select grant', () => {
  it('lets an authenticated operator read the audit log without granting writes', () => {
    expect(sql).toContain('grant select on table public.ops_audit_log to authenticated')
    expect(sql).not.toMatch(/grant\s+(insert|update|delete|all)\s+on\s+table\s+public\.ops_audit_log/i)
  })
})
