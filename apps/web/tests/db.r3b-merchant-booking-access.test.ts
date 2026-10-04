// apps/web/tests/db.r3b-merchant-booking-access.test.ts
import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

const sql = readFileSync(
  join(process.cwd(), '../../supabase/migrations/20260704160000_r3b_merchant_booking_access_and_completion.sql'),
  'utf8',
)

describe('bookings_merchant_select policy', () => {
  it('scopes to experiences owned by the caller’s own merchant_profiles row', () => {
    expect(sql).toContain('create policy bookings_merchant_select on public.bookings')
    expect(sql).toContain('for select')
    expect(sql).toContain('mp.user_id = auth.uid()')
  })
})

describe('mark_booking_completed() RPC', () => {
  it('is a SECURITY DEFINER function gated on experience ownership, not kinnso_ops_members', () => {
    expect(sql).toContain('create or replace function public.mark_booking_completed(p_booking_id uuid)')
    expect(sql).toContain('security definer')
    expect(sql).not.toContain('is_active_ops')
  })
  it('only allows the confirmed -> completed transition', () => {
    expect(sql).toContain("if v_status <> 'confirmed' then raise exception 'bad_transition'; end if")
  })
  it('rejects a non-owner caller with forbidden', () => {
    expect(sql).toContain("if not v_is_owner then raise exception 'forbidden' using errcode = '42501'; end if")
  })
  it('logs a merchant_completed booking_events row', () => {
    expect(sql).toContain("'merchant_completed'")
  })
  it('explicitly revokes execute from anon and authenticated by name, then grants only to authenticated', () => {
    expect(sql).toContain(
      'revoke all on function public.mark_booking_completed from public, anon, authenticated',
    )
    expect(sql).toContain('grant execute on function public.mark_booking_completed to authenticated')
  })
})
