// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'

const { refreshMock } = vi.hoisted(() => ({ refreshMock: vi.fn() }))
vi.mock('next/navigation', () => ({ useRouter: () => ({ refresh: refreshMock }) }))

import { StudioOffersView, type AffiliateOfferCard } from '@/components/kinnso/pages/StudioOffersView'
import en from '@/lib/i18n/messages/en'

afterEach(() => { cleanup(); refreshMock.mockReset() })

const offer = (over: Partial<AffiliateOfferCard> = {}): AffiliateOfferCard => ({
  id: 'm1',
  title: 'Hotels affiliate',
  summary: 'Earn on every booking.',
  category: 'Hotels',
  compensation: 'Up to 7% commission',
  programUrl: 'https://example.com/hotels',
  participant: null,
  partnerLinks: [],
  ...over,
})

describe('StudioOffersView', () => {
  it('renders the empty state when there are no offers', () => {
    render(<StudioOffersView t={en.studioOffers} offers={[]} onJoin={vi.fn()} onCreateLink={vi.fn()} />)
    expect(screen.getByText(en.studioOffers.empty)).toBeTruthy()
  })

  it('joins an offer the creator has not joined', () => {
    const onJoin = vi.fn()
    render(<StudioOffersView t={en.studioOffers} offers={[offer()]} onJoin={onJoin} onCreateLink={vi.fn()} />)
    expect(screen.getByText('Hotels affiliate')).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: en.studioOffers.join }))
    expect(onJoin).toHaveBeenCalledWith('m1')
    expect(document.querySelector('.k-ticket')).toBeTruthy()
  })

  it('generates a partner link from an active participant and program URL', () => {
    const onCreateLink = vi.fn()
    render(
      <StudioOffersView
        t={en.studioOffers}
        offers={[offer({ participant: { id: 'p1', status: 'active' } })]}
        onJoin={vi.fn()}
        onCreateLink={onCreateLink}
      />,
    )
    fireEvent.click(screen.getByRole('button', { name: en.studioOffers.generateLink }))
    expect(onCreateLink).toHaveBeenCalledWith('p1', 'https://example.com/hotels')
  })

  it('shows the setup-pending note instead of generate when links are not configured', () => {
    render(
      <StudioOffersView
        t={en.studioOffers}
        offers={[offer({ participant: { id: 'p1', status: 'active' } })]}
        linkSetupPending
        onJoin={vi.fn()}
        onCreateLink={vi.fn()}
      />,
    )
    expect(screen.getByText(en.studioOffers.setupNotConfigured)).toBeTruthy()
    expect(screen.queryByRole('button', { name: en.studioOffers.generateLink })).toBeNull()
  })

  it('renders generated links with a copy affordance', async () => {
    const writeText = vi.fn().mockResolvedValue(undefined)
    Object.assign(navigator, { clipboard: { writeText } })
    render(
      <StudioOffersView
        t={en.studioOffers}
        offers={[offer({ participant: { id: 'p1', status: 'active' }, partnerLinks: [{ id: 'l1', partnerUrl: 'https://tp.link/abc', subId: 'kinnso_m_aaaa_p_bbbb_c_creator9' }] })]}
        onJoin={vi.fn()}
        onCreateLink={vi.fn()}
      />,
    )
    expect(screen.getByText('https://tp.link/abc')).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: en.studioOffers.copy }))
    await waitFor(() => expect(writeText).toHaveBeenCalledWith('https://tp.link/abc'))
  })

  it('shows the per-creator tracking id (sub_id) on a generated link', () => {
    render(
      <StudioOffersView
        t={en.studioOffers}
        offers={[offer({ participant: { id: 'p1', status: 'active' }, partnerLinks: [{ id: 'l1', partnerUrl: 'https://tp.link/abc', subId: 'kinnso_m_aaaa_p_bbbb_c_creator9' }] })]}
        onJoin={vi.fn()}
        onCreateLink={vi.fn()}
      />,
    )
    expect(screen.getByText(en.studioOffers.trackingId, { exact: false })).toBeTruthy()
    const tag = screen.getByText(/creator9/) as HTMLElement
    expect(tag.getAttribute('title')).toBe('kinnso_m_aaaa_p_bbbb_c_creator9')
  })
})
