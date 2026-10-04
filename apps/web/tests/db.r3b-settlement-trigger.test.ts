import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

// Executable contract on the R3B settlement migration (same string-assert pattern as
// tests/db.r1b-migration.test.ts and tests/db.r3a2-fix-migration.test.ts): unit tests
// mock Supabase and this project has no SUPABASE_SERVICE_ROLE_KEY configured in any
// .env.test, so this file is what pins the SQL the controller applied live via MCP
// apply_migration (independently verified against the live project in a rolled-back
// transaction at apply time — see the Task 1 implementation report).
const sql = readFileSync(
  join(process.cwd(), '../../supabase/migrations/20260704140000_r3b_booking_settlements_and_trigger.sql'),
  'utf8',
)

describe('booking_settlements table', () => {
  it('has the locked columns and check constraints', () => {
    expect(sql).toContain('create table public.booking_settlements')
    expect(sql).toContain('booking_id uuid not null unique references public.bookings(id) on delete cascade')
    expect(sql).toContain("check (status in ('not_started','pending','partially_paid','paid','disputed'))")
    expect(sql).toContain("check (merchant_payout_status in ('pending','paid'))")
    expect(sql).toContain('merchant_payout_amount numeric not null check (merchant_payout_amount >= 0)')
    expect(sql).toContain("check (creator_commission_status in ('pending','paid'))")
    expect(sql).toContain('creator_commission_amount numeric check (creator_commission_amount >= 0)')
    expect(sql).toContain("check (kinnso_commission_status in ('pending','paid'))")
    expect(sql).toContain('kinnso_commission_amount numeric not null check (kinnso_commission_amount >= 0)')
  })

  it('leaves the creator leg nullable (no creator_commission default) while merchant/kinnso legs are not-null with defaults', () => {
    // creator_commission_status has no `not null default` — only merchant_payout_status
    // and kinnso_commission_status do. This is the load-bearing distinction for
    // PD-R3B-1 (direct bookings have no creator leg at all).
    expect(sql).toContain("merchant_payout_status text not null default 'pending'")
    expect(sql).toContain("kinnso_commission_status text not null default 'pending'")
    expect(sql).toMatch(/creator_commission_status text\s*\n\s*check/)
  })

  it('is RLS-locked to ops only, for every command', () => {
    expect(sql).toContain('alter table public.booking_settlements enable row level security')
    expect(sql).toContain('create policy booking_settlements_ops_all on public.booking_settlements')
    expect(sql).toContain('for all')
    expect(sql).toContain('using (public.is_active_ops())')
    expect(sql).toContain('with check (public.is_active_ops())')
  })
})

describe('create_booking_settlement_on_confirm() trigger', () => {
  it('is a SECURITY DEFINER function with a pinned search_path', () => {
    expect(sql).toContain('create or replace function public.create_booking_settlement_on_confirm()')
    expect(sql).toContain('security definer')
    expect(sql).toContain('set search_path = public')
  })

  it('only fires on the pending_payment -> confirmed transition', () => {
    expect(sql).toContain("if new.status = 'confirmed' and old.status = 'pending_payment' then")
  })

  it('uses fixed 10% rates for kinnso and creator legs (PD-R3B-1)', () => {
    expect(sql).toContain('v_kinnso_rate constant numeric := 0.10')
    expect(sql).toContain('v_creator_rate constant numeric := 0.10')
  })

  it('nulls the creator commission amount when the booking has no creator_id', () => {
    expect(sql).toContain('if new.creator_id is not null then')
    expect(sql).toContain('v_creator_amount := null')
  })

  it('computes merchant payout as the remainder after both commissions', () => {
    expect(sql).toContain(
      'v_merchant_amount := new.total_amount - v_kinnso_amount - coalesce(v_creator_amount, 0)',
    )
  })

  it('is idempotent via on conflict do nothing, keyed on the unique booking_id column', () => {
    expect(sql).toContain('on conflict (booking_id) do nothing')
  })

  it('logs a booking_events audit row alongside the settlement insert', () => {
    expect(sql).toContain("insert into public.booking_events (booking_id, event_type, metadata)")
    expect(sql).toContain("'settlement_created'")
  })

  it('does not redefine confirm_booking_from_webhook() (PD-R3B-3: new trigger, not an edit to shipped R3A-2 code)', () => {
    // The migration's own comment explains the decision by naming that function, which
    // is fine — what must NOT appear is a statement that redefines it.
    expect(sql).not.toContain('create or replace function public.confirm_booking_from_webhook')
  })

  it('is wired as an AFTER UPDATE OF status trigger on bookings', () => {
    expect(sql).toContain('create trigger booking_settlement_on_confirm')
    expect(sql).toContain('after update of status on public.bookings')
    expect(sql).toContain('for each row')
    expect(sql).toContain('execute function public.create_booking_settlement_on_confirm()')
  })
})
