// @vitest-environment jsdom
import { cleanup, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

afterEach(cleanup)

const { getContribMock, listEventsMock, listPerksMock, notFoundMock, creatorPageGateMock } = vi.hoisted(() => ({
  getContribMock: vi.fn(),
  listEventsMock: vi.fn(async () => []),
  listPerksMock: vi.fn(async () => [] as unknown[]),
  notFoundMock: vi.fn(() => { throw new Error('NEXT_NOT_FOUND') }),
  creatorPageGateMock: vi.fn(async () => ({ user: { id: 'creator-user-1' } })),
}))

vi.mock('next/navigation', () => ({
  notFound: notFoundMock,
  redirect: vi.fn((path: string) => { throw new Error(`NEXT_REDIRECT:${path}`) }),
}))
vi.mock('@/lib/admin/guard', () => ({ requireCreatorPage: creatorPageGateMock }))
vi.mock('@/lib/contribution/queries', () => ({
  getCreatorContribution: getContribMock,
  listContributionEvents: listEventsMock,
}))
vi.mock('@/lib/missions/queries', () => ({
  countGatedMissionsByTier: vi.fn(async () => ({ rising: 0, pro: 0, elite: 0 })),
}))
vi.mock('@/lib/perks/queries', () => ({ listActivePerks: listPerksMock }))
vi.mock('@/lib/supabase/server', () => ({
  createSupabaseServerClient: async () => ({
    auth: { getUser: async () => ({ data: { user: { id: 'creator-user-1' } } }) },
  }),
}))

import StudioTierPage from '@/app/[locale]/studio/tier/page'
import { progressToNext } from '@/lib/contribution/tiers'

beforeEach(() => {
  creatorPageGateMock.mockReset()
  creatorPageGateMock.mockResolvedValue({ user: { id: 'creator-user-1' } })
  getContribMock.mockReset()
  getContribMock.mockResolvedValue(progressToNext(55))
  listEventsMock.mockReset()
  listEventsMock.mockResolvedValue([])
  listPerksMock.mockReset()
  listPerksMock.mockResolvedValue([])
})

function perkRow(min_tier: string | null, title: string, partner_name = 'Plaza Premium') {
  return {
    id: title, slug: title, partner_name, title,
    summary: '', category: 'travel', discount_label: '10% off',
    min_tier, redemption_type: 'code',
  }
}

describe('/[locale]/studio/tier host', () => {
  it('redirects non-creator viewers', async () => {
    creatorPageGateMock.mockRejectedValueOnce(new Error('NEXT_REDIRECT:/en/studio'))
    await expect(StudioTierPage({ params: Promise.resolve({ locale: 'en' }) })).rejects.toThrow(/NEXT_REDIRECT/)
    expect(getContribMock).not.toHaveBeenCalled()
  })

  it('renders the tier view for a creator', async () => {
    const ui = await StudioTierPage({ params: Promise.resolve({ locale: 'en' }) })
    render(ui)
    expect(screen.getByText('Tier & contribution')).toBeTruthy()
    expect(getContribMock).toHaveBeenCalledWith(expect.anything(), 'creator-user-1')
  })

  it('asks the guard for hub-redirect denial, not notFound', async () => {
    await StudioTierPage({ params: Promise.resolve({ locale: 'en' }) })
    expect(creatorPageGateMock).toHaveBeenCalledWith(expect.anything(), 'en', 'studio')
  })

  // The ladder does pay off — partner_perks.min_tier is hard-gated by the
  // redemption RPC — but the page showed points with no stated reward.
  it('names the perk gated at the next tier, with its partner and the points left', async () => {
    listPerksMock.mockResolvedValue([
      perkRow('rising', 'Already mine'),
      perkRow('pro', 'Lounge access', 'Plaza Premium'),
      perkRow('elite', 'Two tiers away'),
    ])
    render(await StudioTierPage({ params: Promise.resolve({ locale: 'en' }) }))

    const panel = screen.getByRole('region', { name: 'What your next tier unlocks' })
    expect(panel.textContent).toContain('Lounge access')
    expect(panel.textContent).toContain('Plaza Premium')
    expect(panel.textContent).toContain('95') // 55 pts -> pro at 150
    // A perk the creator already has is not a reason to climb.
    expect(panel.textContent).not.toContain('Already mine')
    expect(panel.textContent).not.toContain('Two tiers away')
  })

  it('says plainly that nothing is gated at the next tier rather than inventing a reward', async () => {
    listPerksMock.mockResolvedValue([perkRow('elite', 'Two tiers away')])
    render(await StudioTierPage({ params: Promise.resolve({ locale: 'en' }) }))

    const panel = screen.getByRole('region', { name: 'What your next tier unlocks' })
    expect(panel.textContent).toContain('No perks are gated at Pro right now')
    expect(panel.textContent).not.toContain('Two tiers away')
  })

  it('states the top of the ladder instead of a next tier the creator cannot reach', async () => {
    getContribMock.mockResolvedValue(progressToNext(500))
    listPerksMock.mockResolvedValue([perkRow('elite', 'Top perk')])
    render(await StudioTierPage({ params: Promise.resolve({ locale: 'en' }) }))

    const panel = screen.getByRole('region', { name: 'What your next tier unlocks' })
    expect(panel.textContent).toContain('Elite is the top tier')
  })

  // An unreachable perk catalog must not take the whole page down; the tier
  // numbers are still true without it.
  it('still renders the page when the perk catalog cannot be read', async () => {
    listPerksMock.mockRejectedValue(new Error('rpc down'))
    render(await StudioTierPage({ params: Promise.resolve({ locale: 'en' }) }))
    expect(screen.getByText('Tier & contribution')).toBeTruthy()
    expect(screen.queryByRole('region', { name: 'What your next tier unlocks' })).toBeNull()
  })
})
