// @vitest-environment jsdom
import { describe, expect, it } from 'vitest'
import { render, screen } from '@testing-library/react'
import { ReceiptRow, RouteMarkers, RouteStamp, TicketCard, TicketDivider } from '@/components/kinnso/MarketPassport'

describe('Market Passport primitives', () => {
  it('renders a route stamp as a labeled visual marker', () => {
    render(<RouteStamp>Creator route / HK -&gt; JP</RouteStamp>)
    expect(screen.getByText('Creator route / HK -> JP')).toBeTruthy()
  })

  it('renders a ticket card with an accessible article label', () => {
    const { container } = render(
      <TicketCard as="article" aria-label="Mission ticket">
        <h2>Tokyo Shibuya mission</h2>
        <TicketDivider />
        <ReceiptRow label="Payout" value="+HK$680" tone="positive" />
      </TicketCard>,
    )
    expect(screen.getByRole('article', { name: 'Mission ticket' })).toBeTruthy()
    expect(screen.getByText('+HK$680')).toBeTruthy()
    expect(container.querySelector('.k-ticket')).toBeTruthy()
  })

  it('marks route marker decoration as hidden from assistive tech', () => {
    const { container } = render(<RouteMarkers points={['HK', 'JP', 'TW']} />)
    const markers = container.querySelector('[aria-hidden="true"]')
    expect(markers).toBeTruthy()
    expect(screen.getByText('HK')).toBeTruthy()
    expect(screen.getByText('JP')).toBeTruthy()
    expect(screen.getByText('TW')).toBeTruthy()
  })
})
