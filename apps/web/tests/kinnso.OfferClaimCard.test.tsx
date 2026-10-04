// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { act } from 'react'
import { render, screen, fireEvent, waitFor, cleanup } from '@testing-library/react'
import { OfferClaimCard } from '@/components/kinnso/OfferClaimCard'

vi.mock('next/navigation', () => ({ useRouter: () => ({ push: vi.fn() }) }))

const {
  trackTravellerEventMock,
  getCurrentJourneyIdMock,
  hasAnalyticsConsentMock,
  subscribeToAnalyticsConsentMock,
  consentListeners,
} = vi.hoisted(() => {
  const consentListeners = new Set<() => void>()
  return {
    trackTravellerEventMock: vi.fn(),
    getCurrentJourneyIdMock: vi.fn(() => null as string | null),
    hasAnalyticsConsentMock: vi.fn(() => false),
    subscribeToAnalyticsConsentMock: vi.fn((callback: () => void) => {
      consentListeners.add(callback)
      return () => consentListeners.delete(callback)
    }),
    consentListeners,
  }
})
vi.mock('@/lib/analytics/client', () => ({
  trackTravellerEvent: trackTravellerEventMock,
  getCurrentJourneyId: getCurrentJourneyIdMock,
  hasAnalyticsConsent: hasAnalyticsConsentMock,
  subscribeToAnalyticsConsent: subscribeToAnalyticsConsentMock,
}))

// Simulates consent arriving (or being revoked) after mount, the same way the
// real subscribeToAnalyticsConsent/notifyConsentSubscribers pair in
// lib/analytics/client.ts drives useSyncExternalStore subscribers.
function setConsent(value: boolean) {
  hasAnalyticsConsentMock.mockReturnValue(value)
  act(() => {
    consentListeners.forEach((callback) => callback())
  })
}

const offer = {
  id: 'offer-1', title: 'Free dessert with any main', terms: 'One per visitor',
  discountKind: 'item', discountValue: 1, merchantName: 'Bloom Tea House',
  validTo: '2027-06-01T00:00:00.000Z',
}

const copy = {
  claimButton: 'Claim this offer',
  validThrough: 'Valid through',
  claimFailed: 'That offer could not be claimed. It may have ended or reached its limit.',
}

describe('OfferClaimCard', () => {
  beforeEach(() => {
    cleanup()
    trackTravellerEventMock.mockClear()
    getCurrentJourneyIdMock.mockReset()
    getCurrentJourneyIdMock.mockReturnValue(null)
    hasAnalyticsConsentMock.mockReset()
    hasAnalyticsConsentMock.mockReturnValue(false)
    subscribeToAnalyticsConsentMock.mockClear()
    consentListeners.clear()
  })

  it('calls onClaim with the offer, creator, guide, source, and an options object with locale/journeyId', async () => {
    const onClaim = vi.fn(async () => ({ ok: true, claimId: 'claim-1' }))
    render(
      <OfferClaimCard
        t={copy}
        locale="en" offer={offer} creatorId="creator-1" guideId="guide-1" source="guide"
        onClaim={onClaim}
      />,
    )
    fireEvent.click(screen.getByText('Claim this offer'))
    await waitFor(() => expect(onClaim).toHaveBeenCalledWith(
      'offer-1', 'creator-1', 'guide-1', 'guide', { locale: 'en', journeyId: null },
    ))
  })

  it('renders the offer title and merchant name', () => {
    render(
      <OfferClaimCard
        t={copy}
        locale="en" offer={offer} creatorId="creator-1" guideId={null} source="profile"
        onClaim={vi.fn()}
      />,
    )
    expect(screen.getByText('Free dessert with any main')).toBeInTheDocument()
    expect(screen.getByText(/Bloom Tea House/)).toBeInTheDocument()
  })

  it('fires offer_viewed on mount with the correct metadata for a guide-sourced offer, when consent is already present', () => {
    hasAnalyticsConsentMock.mockReturnValue(true)
    render(
      <OfferClaimCard
        t={copy}
        locale="en" offer={offer} creatorId="creator-1" guideId="guide-1" source="guide"
        onClaim={vi.fn()}
      />,
    )
    expect(trackTravellerEventMock).toHaveBeenCalledWith('offer_viewed', {
      locale: 'en', routeKey: 'guide_detail', entityType: 'offer', entityId: 'offer-1',
    })
  })

  it('fires offer_viewed on mount with routeKey creator_profile for a profile-sourced offer, when consent is already present', () => {
    hasAnalyticsConsentMock.mockReturnValue(true)
    render(
      <OfferClaimCard
        t={copy}
        locale="en" offer={offer} creatorId="creator-1" guideId={null} source="profile"
        onClaim={vi.fn()}
      />,
    )
    expect(trackTravellerEventMock).toHaveBeenCalledWith('offer_viewed', {
      locale: 'en', routeKey: 'creator_profile', entityType: 'offer', entityId: 'offer-1',
    })
  })

  it('does NOT fire offer_viewed on mount when consent has not been granted yet', () => {
    render(
      <OfferClaimCard
        t={copy}
        locale="en" offer={offer} creatorId="creator-1" guideId="guide-1" source="guide"
        onClaim={vi.fn()}
      />,
    )
    expect(trackTravellerEventMock).not.toHaveBeenCalledWith('offer_viewed', expect.anything())
  })

  it('fires offer_viewed once consent is granted AFTER mount, instead of losing the event', () => {
    render(
      <OfferClaimCard
        t={copy}
        locale="en" offer={offer} creatorId="creator-1" guideId="guide-1" source="guide"
        onClaim={vi.fn()}
      />,
    )
    // Mirrors a visitor who scrolls past the non-blocking consent banner,
    // views the offer, and only grants consent afterwards.
    expect(trackTravellerEventMock).not.toHaveBeenCalledWith('offer_viewed', expect.anything())

    setConsent(true)

    expect(trackTravellerEventMock).toHaveBeenCalledWith('offer_viewed', {
      locale: 'en', routeKey: 'guide_detail', entityType: 'offer', entityId: 'offer-1',
    })
    expect(trackTravellerEventMock).toHaveBeenCalledTimes(1)
  })

  it('fires offer_viewed exactly once even if consent toggles or the component re-renders repeatedly', () => {
    render(
      <OfferClaimCard
        t={copy}
        locale="en" offer={offer} creatorId="creator-1" guideId="guide-1" source="guide"
        onClaim={vi.fn()}
      />,
    )
    setConsent(true)
    setConsent(true)
    setConsent(false)
    setConsent(true)
    expect(trackTravellerEventMock).toHaveBeenCalledTimes(1)
  })

  it('fires offer_claimed only after a successful claim', async () => {
    getCurrentJourneyIdMock.mockReturnValue('11111111-1111-4111-8111-111111111111')
    const onClaim = vi.fn(async () => ({ ok: true, claimId: 'claim-1' }))
    render(
      <OfferClaimCard
        t={copy}
        locale="en" offer={offer} creatorId="creator-1" guideId="guide-1" source="guide"
        onClaim={onClaim}
      />,
    )
    trackTravellerEventMock.mockClear()
    fireEvent.click(screen.getByText('Claim this offer'))
    await waitFor(() => expect(trackTravellerEventMock).toHaveBeenCalledWith('offer_claimed', {
      locale: 'en', routeKey: 'guide_detail', entityType: 'offer', entityId: 'offer-1',
    }))
  })

  it('does not fire offer_claimed when the claim fails', async () => {
    const onClaim = vi.fn(async () => ({ ok: false, errors: { form: ['This offer could not be claimed'] } }))
    render(
      <OfferClaimCard
        t={copy}
        locale="en" offer={offer} creatorId="creator-1" guideId="guide-1" source="guide"
        onClaim={onClaim}
      />,
    )
    trackTravellerEventMock.mockClear()
    fireEvent.click(screen.getByText('Claim this offer'))
    await waitFor(() => expect(onClaim).toHaveBeenCalled())
    expect(trackTravellerEventMock).not.toHaveBeenCalledWith('offer_claimed', expect.anything())
  })

  it('states that a claim failed instead of silently doing nothing', async () => {
    // Cap reached / already claimed / no longer live all used to render nothing:
    // the button simply stopped responding, which reads as a broken page.
    const onClaim = vi.fn(async () => ({ ok: false, errors: { form: ['Offer is no longer available'] } }))
    render(
      <OfferClaimCard
        t={copy}
        locale="en" offer={offer} creatorId="creator-1" guideId="guide-1" source="guide"
        onClaim={onClaim}
      />,
    )

    fireEvent.click(screen.getByText('Claim this offer'))

    const alert = await screen.findByRole('alert')
    expect(alert).toHaveTextContent(copy.claimFailed)
  })

  it('does not leak the server reason for the failure', async () => {
    // The specific reason would expose another visitor's claim state and the
    // merchant's remaining capacity, so it stays server-side.
    const onClaim = vi.fn(async () => ({ ok: false, errors: { form: ['total_cap_reached'] } }))
    render(
      <OfferClaimCard
        t={copy}
        locale="en" offer={offer} creatorId="creator-1" guideId="guide-1" source="guide"
        onClaim={onClaim}
      />,
    )

    fireEvent.click(screen.getByText('Claim this offer'))

    await screen.findByRole('alert')
    expect(screen.queryByText(/total_cap_reached/)).toBeNull()
  })

  it('does not record an offer_claimed event for a failed claim', async () => {
    setConsent(true)
    trackTravellerEventMock.mockClear()
    const onClaim = vi.fn(async () => ({ ok: false, errors: { form: ['nope'] } }))
    render(
      <OfferClaimCard
        t={copy}
        locale="en" offer={offer} creatorId="creator-1" guideId="guide-1" source="guide"
        onClaim={onClaim}
      />,
    )

    fireEvent.click(screen.getByText('Claim this offer'))

    await screen.findByRole('alert')
    const claimed = trackTravellerEventMock.mock.calls.filter((c) => c[0] === 'offer_claimed')
    expect(claimed).toHaveLength(0)
  })

  it('shows no alert before the viewer has tried to claim', () => {
    render(
      <OfferClaimCard
        t={copy}
        locale="en" offer={offer} creatorId="creator-1" guideId="guide-1" source="guide"
        onClaim={vi.fn(async () => ({ ok: true, claimId: 'claim-1' }))}
      />,
    )
    expect(screen.queryByRole('alert')).toBeNull()
  })
})
