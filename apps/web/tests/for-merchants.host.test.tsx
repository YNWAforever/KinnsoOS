// @vitest-environment jsdom
import { render, screen, cleanup } from '@testing-library/react'
import { afterEach, describe, expect, it } from 'vitest'
import en from '@/lib/i18n/messages/en'
import { ForMerchantsView } from '@/components/kinnso/pages/ForMerchantsView'

afterEach(cleanup)

describe('ForMerchantsView', () => {
  it('routes both public mission CTAs through the auth-aware merchant entry', () => {
    render(
      <ForMerchantsView
        locale="en"
        t={en.forMerchants}
        testimonials={[]}
        bookingLive={false}
      />,
    )
    const missionLinks = screen.getAllByRole('link', {
      name: en.forMerchants.heroCtaPrimary,
    })
    expect(missionLinks).toHaveLength(2)
    expect(
      missionLinks.every((link) => link.getAttribute('href') === '/en/merchants/post'),
    ).toBe(true)
    expect(screen.getByText(en.forMerchants.ctaBody).className).toContain('text-white/90')
  })
  it('shows the testimonials strip when quotes exist', () => {
    render(<ForMerchantsView locale="en" t={en.forMerchants} testimonials={[{ id: '1', quote: 'Great', authorName: 'A', authorRole: 'merchant' }]} bookingLive={false} />)
    expect(document.getElementById('for-merchants-testimonials')).toBeTruthy()
  })

  it('selects the explicit Booking waitlist and live claims', () => {
    const t = {
      ...en.forMerchants,
      why3Waitlist: 'merchant waitlist claim',
      why3Live: 'merchant live claim',
    }
    const { rerender } = render(<ForMerchantsView locale="en" t={t} testimonials={[]} bookingLive={false} />)
    expect(screen.getByText(t.why3Waitlist)).toBeTruthy()
    expect(screen.queryByText(t.why3Live)).toBeNull()
    rerender(<ForMerchantsView locale="en" t={t} testimonials={[]} bookingLive />)
    expect(screen.getByText(t.why3Live)).toBeTruthy()
    expect(screen.queryByText(t.why3Waitlist)).toBeNull()
  })
})
