// apps/web/tests/db.r12-0-offer-tables.test.ts
import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

const sql = readFileSync(
  join(process.cwd(), '../../supabase/migrations/20260821100000_r12_0_offer_claim_redemption_tables.sql'),
  'utf8',
)

describe('R12.0 offer/claim/redemption tables', () => {
  it('creates merchant_offers with commission_kind and discount_kind check constraints', () => {
    expect(sql).toContain("discount_kind text not null check (discount_kind in ('percent', 'amount', 'item'))")
    expect(sql).toContain("commission_kind text not null check (commission_kind in ('flat', 'percent'))")
  })

  it('creates offer_claims with visitor_user_id not-null (no anonymous claim path)', () => {
    expect(sql).toContain('visitor_user_id  uuid not null references auth.users(id)')
  })

  it('creates offer_redemptions referencing mission_settlements for the payout link', () => {
    expect(sql).toContain('settlement_id                 uuid references public.mission_settlements(id),')
  })

  it('enables RLS and revokes all client access on all three tables', () => {
    for (const table of ['merchant_offers', 'offer_claims', 'offer_redemptions']) {
      expect(sql).toContain(`alter table public.${table} enable row level security`)
      expect(sql).toContain(`revoke all on public.${table} from public, anon, authenticated`)
    }
  })

  it('grants offer_claims and offer_redemptions select-only (RPC-only writes)', () => {
    expect(sql).toContain('grant select on public.offer_claims to authenticated')
    expect(sql).toContain('grant select on public.offer_redemptions to authenticated')
  })

  it('grants merchant_offers full CRUD for owner self-service', () => {
    expect(sql).toContain('grant select, insert, delete on public.merchant_offers to authenticated')
    expect(sql).toContain('grant update (title, terms, discount_kind, discount_value, commission_kind, commission_value, valid_from, valid_to, per_visitor_limit, total_cap, status, updated_at) on public.merchant_offers to authenticated')
  })
})
