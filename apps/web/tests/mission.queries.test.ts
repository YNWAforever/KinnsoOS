import { describe, expect, it, vi } from 'vitest'
import {
  merchantMissionSelect,
  creatorMissionSelect,
  creatorMissionDetailSelect,
  affiliateOfferSelect,
  opsSettlementSelect,
  creatorSettlementSelect,
  listAffiliateOffers,
  listCreatorMerchantMissions,
  listCreatorSettlements,
  countGatedMissionsByTier,
} from '@/lib/missions/queries'

describe('mission query projections', () => {
  it('keeps merchant mission projection stable', () => {
    expect(merchantMissionSelect).toContain('mission_participants')
    expect(merchantMissionSelect).toContain('mission_settlements')
  })

  it('keeps creator mission projection stable', () => {
    expect(creatorMissionSelect).toContain('affiliate_partner_links')
    expect(creatorMissionSelect).toContain('mission_milestones')
  })

  it('includes program category in the affiliate offer projection', () => {
    expect(affiliateOfferSelect).toContain('category')
  })

  it('keeps ops settlement projection stable', () => {
    expect(opsSettlementSelect).toContain('affiliate_network_events')
    expect(opsSettlementSelect).toContain('mission_participants')
  })

  it('keeps creator settlement projection stable', () => {
    expect(creatorSettlementSelect).toContain('creator_commission_amount')
    expect(creatorSettlementSelect).toContain('missions')
  })

  it('scopes affiliate offers to published travelpayouts missions', async () => {
    const query = { eq: vi.fn(), neq: vi.fn(), order: vi.fn(), select: vi.fn() }
    query.eq.mockReturnValue(query)
    query.neq.mockReturnValue(query)
    query.order.mockResolvedValue({ data: [], error: null })
    query.select.mockReturnValue(query)
    const supabase = { from: vi.fn(() => query) }

    await listAffiliateOffers(supabase as never)

    expect(supabase.from).toHaveBeenCalledWith('missions')
    expect(query.eq).toHaveBeenCalledWith('status', 'published')
    expect(query.eq).toHaveBeenCalledWith('mission_source', 'travelpayouts')
  })

  it('scopes creator merchant missions to non-travelpayouts published missions', async () => {
    const query = { eq: vi.fn(), neq: vi.fn(), order: vi.fn(), select: vi.fn() }
    query.eq.mockReturnValue(query)
    query.neq.mockReturnValue(query)
    query.order.mockResolvedValue({ data: [], error: null })
    query.select.mockReturnValue(query)
    const supabase = { from: vi.fn(() => query) }

    await listCreatorMerchantMissions(supabase as never)

    expect(query.eq).toHaveBeenCalledWith('status', 'published')
    expect(query.neq).toHaveBeenCalledWith('mission_source', 'travelpayouts')
  })

  it('reads settlements from mission_settlements ordered by recency', async () => {
    const query = { select: vi.fn(), order: vi.fn() }
    query.select.mockReturnValue(query)
    query.order.mockResolvedValue({ data: [], error: null })
    const supabase = { from: vi.fn(() => query) }

    await listCreatorSettlements(supabase as never)

    expect(supabase.from).toHaveBeenCalledWith('mission_settlements')
    expect(query.order).toHaveBeenCalledWith('updated_at', { ascending: false })
  })
})

describe('countGatedMissionsByTier', () => {
  it('counts published open merchant missions per gated tier', async () => {
    const query = { eq: vi.fn(), not: vi.fn(), select: vi.fn() }
    query.eq.mockReturnValue(query)
    query.not.mockReturnValue(query)
    query.select.mockReturnValue(query)
    // terminal: `not(...)` returns the awaited result
    query.not.mockResolvedValue({
      data: [{ min_tier: 'pro' }, { min_tier: 'pro' }, { min_tier: 'elite' }],
      error: null,
    })
    const supabase = { from: vi.fn(() => query) }

    const counts = await countGatedMissionsByTier(supabase as never)

    expect(supabase.from).toHaveBeenCalledWith('missions')
    expect(query.eq).toHaveBeenCalledWith('status', 'published')
    expect(query.eq).toHaveBeenCalledWith('mission_source', 'merchant')
    expect(query.eq).toHaveBeenCalledWith('visibility', 'open')
    expect(query.not).toHaveBeenCalledWith('min_tier', 'is', null)
    expect(counts).toEqual({ rising: 0, pro: 2, elite: 1 })
  })
})

describe('creator mission selects', () => {
  it('include min_tier so the UI can gate', () => {
    expect(creatorMissionSelect).toContain('min_tier')
    expect(creatorMissionDetailSelect).toContain('min_tier')
  })

  it('selects the brief richness columns', () => {
    expect(creatorMissionDetailSelect).toContain('deliverables')
    expect(creatorMissionDetailSelect).toContain('requirements')
    expect(creatorMissionDetailSelect).toContain('dos')
    expect(creatorMissionDetailSelect).toContain('donts')
    expect(creatorMissionDetailSelect).toContain('key_messages')
    expect(creatorMissionDetailSelect).toContain('reference_links')
    expect(creatorMissionDetailSelect).toContain('effort')
  })
})
