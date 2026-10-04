// apps/web/tests/db.r3a2-migration.test.ts
import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

const sql = readFileSync(
  join(process.cwd(), '../../supabase/migrations/20260704120000_r3a2_stripe_webhook_confirmation_and_rate_limit.sql'),
  'utf8',
)

describe('confirm_booking_from_webhook() RPC', () => {
  it('is a SECURITY DEFINER function with a pinned search_path', () => {
    expect(sql).toContain('create or replace function public.confirm_booking_from_webhook(')
    expect(sql).toContain('security definer')
    expect(sql).toContain('set search_path = public')
  })
  it('is idempotent — no-ops when the booking is not pending_payment', () => {
    expect(sql).toContain("if v_status <> 'pending_payment' then")
    expect(sql).toContain('return;')
  })
  it('row-locks the booking before transitioning it', () => {
    expect(sql).toMatch(/where stripe_checkout_session_id = p_stripe_checkout_session_id\s+for update/)
  })
  it('clamps booked_count to capacity rather than failing the transaction', () => {
    expect(sql).toContain('least(booked_count + v_qty, capacity)')
  })
  it('logs an overbooked event when the clamp actually engages', () => {
    expect(sql).toContain("'overbooked'")
  })
  it('is executable only by service_role', () => {
    expect(sql).toContain('revoke all on function public.confirm_booking_from_webhook(text, text) from public')
    expect(sql).toContain('grant execute on function public.confirm_booking_from_webhook(text, text) to service_role')
  })
  it('grants confirm_booking_from_webhook execute to service_role only — never anon or authenticated', () => {
    // Added after a live incident during Task 2: this project's default ACL
    // auto-grants EXECUTE on new functions to anon/authenticated, and
    // `revoke all ... from public` alone does NOT undo that — only an
    // explicit `revoke ... from anon, authenticated` by name does. This test
    // must isolate the exact grant line for THIS function (not just grep the
    // whole file for "anon", since the other two functions in this same
    // migration correctly DO grant to anon/authenticated).
    const grantLine = sql
      .split('\n')
      .find((line) => line.includes('grant execute on function public.confirm_booking_from_webhook'))
    expect(grantLine).toBeTruthy()
    expect(grantLine).not.toMatch(/\banon\b/)
    expect(grantLine).not.toMatch(/\bauthenticated\b/)
    expect(grantLine).toContain('service_role')
  })
})

describe('get_booking_by_checkout_session() RPC', () => {
  it('is a STABLE SECURITY DEFINER function executable by anon and authenticated', () => {
    expect(sql).toContain('create or replace function public.get_booking_by_checkout_session(p_session_id text)')
    expect(sql).toContain('security definer')
    expect(sql).toContain('grant execute on function public.get_booking_by_checkout_session(text) to anon, authenticated')
  })
})

describe('checkout_rate_limits', () => {
  it('has no anon/authenticated grants on the table itself', () => {
    expect(sql).toContain('revoke all on table public.checkout_rate_limits from anon, authenticated')
  })
  it('check_and_increment_checkout_rate_limit is an atomic single-statement upsert, executable by anon and authenticated', () => {
    expect(sql).toContain('on conflict (ip) do update')
    expect(sql).toContain('grant execute on function public.check_and_increment_checkout_rate_limit(text, integer, integer) to anon, authenticated')
  })
})
