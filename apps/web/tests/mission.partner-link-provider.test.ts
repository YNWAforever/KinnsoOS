import { describe, expect, it, vi } from 'vitest'
import { createTravelpayoutsPartnerLinkProvider } from '@/lib/missions/partner-link-provider'

const {
  buildSubIdMock,
  canonicalizeTravelpayoutsPartnerUrlMock,
  createTravelpayoutsPartnerLinksMock,
} = vi.hoisted(() => ({
  buildSubIdMock: vi.fn(),
  canonicalizeTravelpayoutsPartnerUrlMock: vi.fn(),
  createTravelpayoutsPartnerLinksMock: vi.fn(),
}))

vi.mock('@/lib/missions/travelpayouts', () => ({
  buildSubId: buildSubIdMock,
  canonicalizeTravelpayoutsPartnerUrl: canonicalizeTravelpayoutsPartnerUrlMock,
  createTravelpayoutsPartnerLinks: createTravelpayoutsPartnerLinksMock,
}))

describe('createTravelpayoutsPartnerLinkProvider', () => {
  it('delegates deterministic SubID construction', () => {
    buildSubIdMock.mockReturnValue('creator-sub')
    const provider = createTravelpayoutsPartnerLinkProvider()

    expect(provider.buildSubId({
      missionId: 'm1',
      participantId: 'p1',
      creatorId: 'c1',
    })).toBe('creator-sub')
    expect(buildSubIdMock).toHaveBeenCalledWith({
      missionId: 'm1',
      participantId: 'p1',
      creatorId: 'c1',
    })
  })

  it('creates and canonicalizes a successful link', async () => {
    createTravelpayoutsPartnerLinksMock.mockResolvedValue([{
      originalUrl: 'https://example.com/hotel',
      partnerUrl: 'https://tp.st/abc',
      status: 'success',
    }])
    canonicalizeTravelpayoutsPartnerUrlMock.mockReturnValue(
      'https://tp.st/abc?sub_id=creator-sub',
    )
    const provider = createTravelpayoutsPartnerLinkProvider()

    await expect(provider.create({
      originalUrl: 'https://example.com/hotel',
      subId: 'creator-sub',
    })).resolves.toEqual({
      ok: true,
      partnerUrl: 'https://tp.st/abc?sub_id=creator-sub',
    })
    expect(createTravelpayoutsPartnerLinksMock).toHaveBeenCalledWith({
      shorten: true,
      links: [{ url: 'https://example.com/hotel', subId: 'creator-sub' }],
    })
    expect(canonicalizeTravelpayoutsPartnerUrlMock).toHaveBeenCalledWith(
      'https://tp.st/abc',
      'creator-sub',
    )
  })

  it('returns failure reasons for failed output and thrown errors', async () => {
    createTravelpayoutsPartnerLinksMock.mockResolvedValue([{
      originalUrl: 'https://example.com/hotel',
      partnerUrl: '',
      status: 'failed',
      message: 'Unsupported link',
    }])
    const provider = createTravelpayoutsPartnerLinkProvider()
    await expect(provider.create({
      originalUrl: 'https://example.com/hotel',
      subId: 'creator-sub',
    })).resolves.toEqual({ ok: false, reason: 'Unsupported link' })

    createTravelpayoutsPartnerLinksMock.mockRejectedValue(new Error('HTTP 429 rate limited'))
    await expect(provider.create({
      originalUrl: 'https://example.com/hotel',
      subId: 'creator-sub',
    })).resolves.toEqual({ ok: false, reason: 'HTTP 429 rate limited' })
  })

  it('returns a safe failure for an unusable response or unsafe URL', async () => {
    createTravelpayoutsPartnerLinksMock.mockResolvedValue([])
    const provider = createTravelpayoutsPartnerLinkProvider()
    await expect(provider.create({
      originalUrl: 'https://example.com/hotel',
      subId: 'creator-sub',
    })).resolves.toEqual({ ok: false, reason: 'no partner link returned' })

    createTravelpayoutsPartnerLinksMock.mockResolvedValue([{
      originalUrl: 'https://example.com/hotel',
      partnerUrl: 'https://example.net/not-travelpayouts',
      status: 'success',
    }])
    canonicalizeTravelpayoutsPartnerUrlMock.mockImplementation(() => {
      throw new Error('Travelpayouts returned an invalid partner URL')
    })
    await expect(provider.create({
      originalUrl: 'https://example.com/hotel',
      subId: 'creator-sub',
    })).resolves.toEqual({
      ok: false,
      reason: 'Travelpayouts returned an invalid partner URL',
    })
  })
})
