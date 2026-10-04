import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

const sql = readFileSync(
  join(process.cwd(), '../../supabase/migrations/20260822090400_r12_2_submit_receipt.sql'),
  'utf8',
)

describe('submit_receipt RPC', () => {
  it('locks the mission row and rejects a non-receipt_cashback mission', () => {
    expect(sql).toContain('from public.missions')
    expect(sql).toContain('for update')
    expect(sql).toContain("if v_mission_type <> 'receipt_cashback' then raise exception 'wrong_mission_type'")
  })

  it('requires an active participant row before allowing a submission', () => {
    expect(sql).toContain("status = 'active'")
    expect(sql).toContain("raise exception 'not_active_participant'")
  })

  it('enforces the cap by counting only submitted/approved rows, not rejected ones', () => {
    expect(sql).toContain("status in ('submitted', 'approved')")
    expect(sql).toContain("raise exception 'receipt_cap_reached'")
  })

  it('skips the cap check entirely when max_receipts_per_creator is null', () => {
    expect(sql).toContain('if v_max_receipts is not null then')
  })

  it('restricts execution to authenticated only', () => {
    expect(sql).toContain('revoke all on function public.submit_receipt(uuid, text[]) from public, anon')
    expect(sql).toContain('grant execute on function public.submit_receipt(uuid, text[]) to authenticated')
  })

  it('rejects a signed-out caller', () => {
    expect(sql).toContain('v_creator_id uuid := auth.uid()')
    expect(sql).toContain("if v_creator_id is null then raise exception 'unauthorized' using errcode = '42501'")
  })

  it('requires at least one proof url', () => {
    expect(sql).toContain("if coalesce(array_length(p_proof_urls, 1), 0) = 0 then raise exception 'proof_required'")
  })

  it('raises mission_not_found when the mission id does not resolve', () => {
    expect(sql).toContain('where id = p_mission_id')
    expect(sql).toContain("if not found then raise exception 'mission_not_found' using errcode = 'P0002'")
  })

  it('raises no_repeatable_milestone when the mission has no repeatable milestone row', () => {
    expect(sql).toContain('from public.mission_milestones')
    expect(sql).toContain('where mission_id = p_mission_id and repeatable = true')
    expect(sql).toContain("if v_milestone_id is null then raise exception 'no_repeatable_milestone' using errcode = 'P0002'")
  })

  it('returns the new submission id as jsonb', () => {
    expect(sql).toContain('returning id into v_submission_id')
    expect(sql).toContain("return jsonb_build_object('submission_id', v_submission_id)")
  })
})
