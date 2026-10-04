// apps/web/tests/db.r12-0-attention-redemption-velocity.test.ts
import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

const sql = readFileSync(
  join(process.cwd(), '../../supabase/migrations/20260821100400_r12_0_admin_mission_attention_redemption_velocity.sql'),
  'utf8',
)

describe('admin_mission_attention redemption_velocity widening', () => {
  it('adds a redemption_velocity key alongside the two existing keys', () => {
    expect(sql).toContain("'overdue_reviews',")
    expect(sql).toContain("'at_risk_missions',")
    expect(sql).toContain("'redemption_velocity', coalesce((")
  })

  it('flags offers with 10+ redemptions in the last hour', () => {
    expect(sql).toContain("having count(orr.id) >= 10")
    expect(sql).toContain("interval '1 hour'")
  })

  it('keeps the is_active_ops gate unchanged', () => {
    expect(sql).toContain('if not public.is_active_ops() then')
  })

  it('correlates redemptions to a specific offer via offer_claims, not merchant-wide', () => {
    expect(sql).toContain('join public.offer_claims oc on oc.offer_id = mo.id')
    expect(sql).toContain('join public.offer_redemptions orr on orr.offer_claim_id = oc.id')
  })
})
