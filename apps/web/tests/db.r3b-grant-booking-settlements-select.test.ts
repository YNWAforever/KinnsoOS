// apps/web/tests/db.r3b-grant-booking-settlements-select.test.ts
import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

const sql = readFileSync(
  join(process.cwd(), '../../supabase/migrations/20260821090000_r3b_grant_booking_settlements_select.sql'),
  'utf8',
)

describe('booking_settlements select grant fix', () => {
  it('grants select on booking_settlements to authenticated', () => {
    // 20260704141000 revoked the default ALL auto-grant but never re-granted the
    // SELECT that booking_settlements_ops_all (RLS, gated on is_active_ops()) needs
    // to be reachable at all — listOpsBookingSettlements() has 42501'd since then.
    expect(sql).toContain('grant select on table public.booking_settlements to authenticated')
  })
})
