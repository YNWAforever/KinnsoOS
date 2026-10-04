// apps/web/tests/db.r3b-settlement-status-rpc.test.ts
import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

// Same string-assert pattern as tests/db.r1b-migration.test.ts,
// tests/db.r3a2-fix-migration.test.ts, and this plan's own
// tests/db.r3b-settlement-trigger.test.ts (Task 1): unit tests mock Supabase and this
// project has no SUPABASE_SERVICE_ROLE_KEY configured in any .env.test, so this file is
// what pins the SQL applied live via MCP apply_migration. The grant itself was
// independently verified live against information_schema.role_routine_grants (see the
// Task 2 implementation report) — it shows the same three-row shape (authenticated,
// postgres, service_role) as the already-live reference function
// admin_set_settlement_status, with no anon/PUBLIC row.
const sql = readFileSync(
  join(process.cwd(), '../../supabase/migrations/20260704150000_r3b_admin_settlement_status_rpc.sql'),
  'utf8',
)

describe('admin_set_booking_settlement_status() RPC', () => {
  it('is a SECURITY DEFINER function gated on admin rank', () => {
    expect(sql).toContain('create or replace function public.admin_set_booking_settlement_status(')
    expect(sql).toContain('security definer')
    expect(sql).toContain("if not public.is_active_ops_role('admin') then")
  })

  it('requires a non-empty, length-capped reason', () => {
    expect(sql).toContain("if coalesce(btrim(p_reason), '') = '' then raise exception 'reason_required'; end if")
    expect(sql).toContain("if length(btrim(p_reason)) > 500 then raise exception 'reason_too_long'; end if")
  })

  it('rejects a leg-status change on a null (no-creator) leg', () => {
    expect(sql).toContain("if v_cc is null then raise exception 'no_creator_leg'; end if")
  })

  it('enforces the rank-based transition matrix with a p_allow_revert escape hatch', () => {
    expect(sql).toContain('v_rank_to < v_rank_from and not coalesce(p_allow_revert, false) then')
    expect(sql).toContain("raise exception 'bad_transition'")
  })

  it('logs to ops_audit_log_append with entity_type booking_settlement', () => {
    expect(sql).toContain(
      "public.ops_audit_log_append('booking_settlement', p_id, 'booking_settlement.status', p_reason,",
    )
  })

  it('explicitly revokes execute from anon and authenticated by name, then grants only to authenticated', () => {
    expect(sql).toContain(
      'revoke all on function public.admin_set_booking_settlement_status from public, anon, authenticated',
    )
    expect(sql).toContain('grant execute on function public.admin_set_booking_settlement_status to authenticated')
  })

  it('requires all four status fields to be null to raise no_change', () => {
    expect(sql).toContain('if p_status is null and p_merchant_payout_status is null')
    expect(sql).toContain('and p_creator_commission_status is null and p_kinnso_commission_status is null then')
  })

  it('raises not_found when the settlement row does not exist', () => {
    expect(sql).toContain(
      'from public.booking_settlements where id = p_id for update',
    )
    expect(sql).toContain("if not found then raise exception 'not_found'; end if")
  })

  it('constrains status and leg-status values via bad_status/bad_leg_status guards', () => {
    expect(sql).toContain(
      "if p_status not in ('not_started','pending','partially_paid','paid','disputed') then",
    )
    expect(sql).toContain("raise exception 'bad_status'")
    expect(sql).toContain("if p_merchant_payout_status not in ('pending','paid') then raise exception 'bad_leg_status'; end if")
    expect(sql).toContain("if p_creator_commission_status not in ('pending','paid') then raise exception 'bad_leg_status'; end if")
    expect(sql).toContain("if p_kinnso_commission_status not in ('pending','paid') then raise exception 'bad_leg_status'; end if")
  })
})
