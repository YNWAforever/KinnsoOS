import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

const sql = readFileSync(
  join(process.cwd(), '../../supabase/migrations/20260821100500_r12_0_list_offers_for_creator.sql'),
  'utf8',
)

describe('list_offers_for_creator RPC', () => {
  it('only returns live offers within their validity window and under cap', () => {
    expect(sql).toContain("mo.status = 'live'")
    expect(sql).toContain('now() between mo.valid_from and mo.valid_to')
    expect(sql).toContain('mo.total_cap is null or mo.claimed_count < mo.total_cap')
  })

  it('scopes to the given creator via an active/completed mission_participants row', () => {
    expect(sql).toContain("and part.status in ('active', 'completed')")
  })

  it('never exposes internal counters like claimed_count or redeemed_count', () => {
    expect(sql).not.toMatch(/select[\s\S]*claimed_count[\s\S]*from public\.merchant_offers mo\n  join/)
  })

  it('is readable by anon (public browsing) but writes stay authenticated-only elsewhere', () => {
    expect(sql).toContain('grant execute on function public.list_offers_for_creator(uuid) to anon, authenticated')
  })

  it('excludes offers from paused/archived merchants, matching the codebase-wide merchant_is_active pattern', () => {
    expect(sql).toContain('and app_private.merchant_is_active(mo.merchant_profile_id)')
  })
})
