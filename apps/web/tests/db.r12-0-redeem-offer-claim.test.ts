// apps/web/tests/db.r12-0-redeem-offer-claim.test.ts
import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

const sql = readFileSync(
  join(process.cwd(), '../../supabase/migrations/20260821100200_r12_0_redeem_offer_claim.sql'),
  'utf8',
)

describe('redeem_offer_claim RPC', () => {
  it('locks the claim row for update before checking status', () => {
    expect(sql).toContain('where claim_token_hash = v_token_hash\n    for update')
  })

  it('returns already_redeemed for a second call instead of erroring', () => {
    expect(sql).toContain("'already_redeemed', true")
  })

  it('requires the caller to be staff of the offer\'s own merchant', () => {
    expect(sql).toContain("raise exception 'forbidden' using errcode = '42501'")
    expect(sql).toContain('mp.user_id = v_staff')
  })

  it('requires amount_spent only for percent-commission offers', () => {
    expect(sql).toContain("if v_offer.commission_kind = 'percent' and p_amount_spent is null then")
  })

  it('marks an expired claim expired and returns a soft-fail result instead of raising (so the status update actually commits)', () => {
    expect(sql).toContain("update public.offer_claims set status = 'expired' where id = v_claim.id and status = 'active'")
    expect(sql).toContain("return jsonb_build_object('expired', true)")
  })

  it('rejects a NaN amount_spent before any writes', () => {
    expect(sql).toContain("if p_amount_spent is not null and p_amount_spent = 'NaN'::numeric then")
    expect(sql).toContain("raise exception 'bad_amount_spent'")
  })

  it('revokes public/anon and grants only authenticated', () => {
    expect(sql).toContain('revoke all on function public.redeem_offer_claim(text, numeric) from public, anon')
    expect(sql).toContain('grant execute on function public.redeem_offer_claim(text, numeric) to authenticated')
  })

  it('rejects a signed-out caller and an empty token', () => {
    expect(sql).toContain("raise exception 'unauthorized' using errcode = '42501'")
    expect(sql).toContain("raise exception 'bad_token'")
    expect(sql).toContain("raise exception 'claim_not_found' using errcode = 'P0002'")
  })
})
