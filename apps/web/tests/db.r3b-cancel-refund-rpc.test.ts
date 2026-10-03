// apps/web/tests/db.r3b-cancel-refund-rpc.test.ts
import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

const sql = readFileSync(
  join(process.cwd(), '../../supabase/migrations/20260704170000_r3b_admin_cancel_refund_booking.sql'),
  'utf8',
)

describe('admin_cancel_and_refund_booking() RPC', () => {
  it('is a SECURITY DEFINER function gated on admin rank, reason-required', () => {
    expect(sql).toContain('create or replace function public.admin_cancel_and_refund_booking(')
    expect(sql).toContain('security definer')
    expect(sql).toContain("if not public.is_active_ops_role('admin') then")
    expect(sql).toContain("if coalesce(btrim(p_reason), '') = '' then raise exception 'reason_required'; end if")
  })
  it('requires a non-empty stripe refund id', () => {
    expect(sql).toContain(
      "if coalesce(btrim(p_stripe_refund_id), '') = '' then raise exception 'refund_id_required'; end if",
    )
  })
  it('only allows refunding a confirmed or completed booking', () => {
    expect(sql).toContain("if v_status not in ('confirmed', 'completed') then raise exception 'bad_transition'; end if")
  })
  it('flips the booking to refunded and the settlement to disputed', () => {
    expect(sql).toContain("set status = 'refunded'")
    expect(sql).toContain("set status = 'disputed'")
  })
  it('logs both a booking_events row and an ops_audit_log_append call', () => {
    expect(sql).toContain("'ops_cancelled_refunded'")
    expect(sql).toContain("public.ops_audit_log_append('booking', p_booking_id, 'booking.refund', p_reason,")
  })
  it('explicitly revokes execute from anon and authenticated by name, then grants only to authenticated', () => {
    expect(sql).toContain(
      'revoke all on function public.admin_cancel_and_refund_booking from public, anon, authenticated',
    )
    expect(sql).toContain('grant execute on function public.admin_cancel_and_refund_booking to authenticated')
  })
})
