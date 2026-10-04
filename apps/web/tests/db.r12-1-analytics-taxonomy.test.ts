import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

const sql = readFileSync(
  join(process.cwd(), '../../supabase/migrations/20260821120000_r12_1_analytics_taxonomy_and_journey_columns.sql'),
  'utf8',
)

describe('R12.1 analytics taxonomy + offer_claims journey columns', () => {
  it('adds the three offer-funnel event names to the event_name check', () => {
    expect(sql).toContain("'offer_viewed'")
    expect(sql).toContain("'offer_claimed'")
    expect(sql).toContain("'offer_redeemed'")
  })

  it('adds offer to the entity_type check', () => {
    expect(sql).toContain("entity_type in ('guide', 'experience', 'creator', 'article', 'offer')")
  })

  it('adds analytics_journey_id and analytics_locale to offer_claims, both-or-neither', () => {
    expect(sql).toContain('add column analytics_journey_id uuid')
    expect(sql).toContain('add column analytics_locale text')
    expect(sql).toContain('offer_claims_analytics_pair_check')
  })
})
