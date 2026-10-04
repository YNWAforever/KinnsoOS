// apps/web/tests/db.r3b-fix-settlements-grant.test.ts
import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

const sql = readFileSync(
  join(process.cwd(), '../../supabase/migrations/20260704141000_r3b_fix_booking_settlements_table_grant.sql'),
  'utf8',
)

describe('booking_settlements table grant fix', () => {
  it('explicitly revokes all table privileges from anon and authenticated by name', () => {
    // This project's default privileges auto-grant ALL on every new public table
    // directly to anon/authenticated — the table-level counterpart to the function-grant
    // gotcha that hit confirm_booking_from_webhook() in R3A-2
    // (20260704130000_r3a2_fix_confirm_booking_webhook_grant.sql). RLS already denies
    // anon in practice (no anon-scoped policy exists on booking_settlements), but the
    // underlying grant must not be left standing as a defense-in-depth matter.
    expect(sql).toContain('revoke all on table public.booking_settlements from anon, authenticated')
  })
})
