// apps/web/tests/db.r12-0-claim-offer.test.ts
import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

const sql = readFileSync(
  join(process.cwd(), '../../supabase/migrations/20260821100100_r12_0_claim_offer.sql'),
  'utf8',
)

describe('claim_offer RPC', () => {
  it('takes for update on merchant_offers to serialize claim attempts', () => {
    expect(sql).toContain('from public.merchant_offers\n    where id = p_offer_id\n    for update')
  })

  it('enforces total_cap and per_visitor_limit as plain checks under the lock', () => {
    expect(sql).toContain("raise exception 'offer_cap_reached'")
    expect(sql).toContain("raise exception 'visitor_limit_reached'")
  })

  it('requires the offer to be live and within its validity window', () => {
    expect(sql).toContain("raise exception 'offer_not_live'")
    expect(sql).toContain("raise exception 'offer_not_in_window'")
  })

  it('checks creator eligibility via mission_participants active/completed status', () => {
    expect(sql).toContain("and mp.status in ('active', 'completed')")
  })

  it('never persists the raw token, only its sha256 hash', () => {
    expect(sql).toContain("v_token_hash := encode(extensions.digest(v_raw_token, 'sha256'), 'hex')")
    expect(sql).toContain('values (p_offer_id, p_creator_id, p_guide_id, v_visitor, v_token_hash, p_source, v_offer.valid_to)')
  })

  it('revokes public/anon and grants only authenticated', () => {
    expect(sql).toContain('revoke all on function public.claim_offer(uuid, uuid, uuid, text) from public, anon')
    expect(sql).toContain('grant execute on function public.claim_offer(uuid, uuid, uuid, text) to authenticated')
  })

  it('rejects a signed-out caller and validates the source argument', () => {
    expect(sql).toContain("raise exception 'unauthorized' using errcode = '42501'")
    expect(sql).toContain("raise exception 'bad_source'")
    expect(sql).toContain("raise exception 'guide_id_required'")
    expect(sql).toContain("raise exception 'guide_mismatch' using errcode = '42501'")
  })
})
