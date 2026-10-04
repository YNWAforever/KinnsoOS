import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

const sql = readFileSync(
  join(process.cwd(), '../../supabase/migrations/20260822090300_r12_2_receipt_reason_taxonomy.sql'),
  'utf8',
)

describe('R12.2 receipt-specific rejection reason taxonomy', () => {
  it('widens the flat reason_category check to the union of both taxonomies', () => {
    expect(sql).toContain("'format', 'key_message', 'compliance', 'quality', 'other',")
    expect(sql).toContain("'unreadable', 'wrong_venue', 'duplicate', 'amount_unclear'")
  })

  it('adds a mission-type-aware trigger enforcing the correct taxonomy per mission type', () => {
    expect(sql).toContain('before insert on public.mission_review_events')
    expect(sql).toContain("if v_mission_type = 'receipt_cashback' then")
    expect(sql).toContain("raise exception 'bad_reason_category_for_receipt_cashback'")
    expect(sql).toContain("raise exception 'bad_reason_category_for_mission_type'")
  })

  it('widens admin_review_submission with the same mission-type-aware check, signature unchanged', () => {
    expect(sql).not.toContain('drop function public.admin_review_submission')
    expect(sql).toContain('create or replace function public.admin_review_submission(')
    expect(sql).toContain('select m.mission_type into v_mission_type')
  })

  it('preserves every existing guard in admin_review_submission unchanged', () => {
    expect(sql).toContain("if not public.is_active_ops_role('admin') then")
    expect(sql).toContain("raise exception 'reason_required'")
    expect(sql).toContain("raise exception 'stale_status'")
    expect(sql).toContain('perform public.ops_audit_log_append(')
  })
})
