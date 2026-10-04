// apps/web/tests/db.r3b-fix-cancel-refund-settlement-guard.test.ts
import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

const sql = readFileSync(
  join(
    process.cwd(),
    '../../supabase/migrations/20260704171000_r3b_fix_cancel_refund_settlement_not_found_guard.sql',
  ),
  'utf8',
)

describe('admin_cancel_and_refund_booking() settlement not-found guard fix', () => {
  it('locks and checks the booking_settlements row exists before updating it', () => {
    // Code-quality review for Task 4 found the original version blindly UPDATEd
    // booking_settlements with no `not found` check, unlike Task 2's own pattern
    // against the same table -- a missing settlement row would silently affect zero
    // rows while still logging success via booking_events/ops_audit_log_append.
    expect(sql).toContain(
      'select id into v_settlement_id from public.booking_settlements where booking_id = p_booking_id for update',
    )
    expect(sql).toContain("if not found then raise exception 'settlement_not_found'; end if")
  })

  it('still updates booking_settlements by its locked id, scoped correctly', () => {
    expect(sql).toContain('where id = v_settlement_id')
  })

  it('preserves every original guard (admin gate, reason, refund id, bad_transition)', () => {
    expect(sql).toContain("if not public.is_active_ops_role('admin') then")
    expect(sql).toContain("if coalesce(btrim(p_reason), '') = '' then raise exception 'reason_required'; end if")
    expect(sql).toContain(
      "if coalesce(btrim(p_stripe_refund_id), '') = '' then raise exception 'refund_id_required'; end if",
    )
    expect(sql).toContain("if v_status not in ('confirmed', 'completed') then raise exception 'bad_transition'; end if")
  })
})
