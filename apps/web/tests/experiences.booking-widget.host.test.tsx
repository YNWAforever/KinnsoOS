// apps/web/tests/experiences.booking-widget.host.test.tsx
// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, render, screen, fireEvent } from '@testing-library/react'
import { BookingWidget } from '@/components/kinnso/pages/BookingWidget'
import en from '@/lib/i18n/messages/en'

const { createCheckoutSessionActionMock } = vi.hoisted(() => ({
  createCheckoutSessionActionMock: vi.fn(),
}))
vi.mock('@/lib/experiences/booking-actions', () => ({
  createCheckoutSessionAction: createCheckoutSessionActionMock,
}))

afterEach(cleanup)

const experience = {
  id: 'exp1', slug: 'tokyo-crawl', title: 'Tokyo After-Hours Izakaya Crawl', summary: null,
  description: null, city: 'Tokyo', priceAmount: 1200, currency: 'HKD', durationMinutes: 180,
  coverUrl: null, publishedAt: null, savesCount: 0, merchant: { slug: 'sunrise-stays', companyName: 'Sunrise Stays HK' },
}

describe('BookingWidget', () => {
  it('renders the empty state when there is no availability', () => {
    render(<BookingWidget locale="en" t={en.booking} experience={experience} availability={[]} viewerEmail={null} />)
    expect(screen.getByText(en.booking.noAvailability)).toBeInTheDocument()
  })

  it('hides the guest email field for signed-in viewers', () => {
    render(
      <BookingWidget
        locale="en"
        t={en.booking}
        experience={experience}
        availability={[{ id: 'a1', date: '2026-08-01', remaining: 4 }]}
        viewerEmail="traveler@example.com"
      />,
    )
    expect(screen.queryByLabelText(en.booking.guestEmailLabel)).not.toBeInTheDocument()
    expect(screen.getByText(en.booking.submitCta)).toBeInTheDocument()
  })

  it('shows the guest email field for anonymous viewers', () => {
    render(
      <BookingWidget
        locale="en"
        t={en.booking}
        experience={experience}
        availability={[{ id: 'a1', date: '2026-08-01', remaining: 4 }]}
        viewerEmail={null}
      />,
    )
    expect(screen.getByLabelText(en.booking.guestEmailLabel)).toBeInTheDocument()
  })

  it('marks a sold-out date as disabled in the date selector', () => {
    render(
      <BookingWidget
        locale="en"
        t={en.booking}
        experience={experience}
        availability={[{ id: 'a1', date: '2026-08-01', remaining: 0 }]}
        viewerEmail="traveler@example.com"
      />,
    )
    expect(screen.getByText(new RegExp(en.booking.soldOutLabel))).toBeInTheDocument()
  })

  it('disables the submit button when every date is sold out', () => {
    render(
      <BookingWidget
        locale="en"
        t={en.booking}
        experience={experience}
        availability={[{ id: 'a1', date: '2026-08-01', remaining: 0 }]}
        viewerEmail="traveler@example.com"
      />,
    )
    expect(screen.getByText(en.booking.submitCta).closest('button')).toBeDisabled()
  })

  it('shows an inline error when the action returns a failure', async () => {
    createCheckoutSessionActionMock.mockResolvedValue({ ok: false, errors: { form: ['Not enough spots left for that date'] } })
    render(
      <BookingWidget
        locale="en"
        t={en.booking}
        experience={experience}
        availability={[{ id: 'a1', date: '2026-08-01', remaining: 4 }]}
        viewerEmail="traveler@example.com"
      />,
    )
    fireEvent.click(screen.getByText(en.booking.submitCta))
    expect(await screen.findByText('Not enough spots left for that date')).toBeInTheDocument()
  })

  it('threads sourceSurface and guideSlug into the checkout action when given', async () => {
    createCheckoutSessionActionMock.mockResolvedValue({ ok: true, checkoutUrl: 'https://x' })
    render(
      <BookingWidget
        locale="en"
        t={en.booking}
        experience={experience}
        availability={[{ id: 'a1', date: '2026-08-01', remaining: 4 }]}
        viewerEmail="traveler@example.com"
        sourceSurface="guide"
        guideSlug="kyoto-tea"
      />,
    )
    fireEvent.click(screen.getByText(en.booking.submitCta))
    await vi.waitFor(() => {
      expect(createCheckoutSessionActionMock).toHaveBeenCalledWith(
        expect.any(String),
        expect.any(Object),
        { locale: 'en', sourceSurface: 'guide', guideSlug: 'kyoto-tea' },
      )
    })
  })

  it('omits sourceSurface and guideSlug from the checkout action when neither prop is given', async () => {
    createCheckoutSessionActionMock.mockResolvedValue({ ok: true, checkoutUrl: 'https://x' })
    render(
      <BookingWidget
        locale="en"
        t={en.booking}
        experience={experience}
        availability={[{ id: 'a1', date: '2026-08-01', remaining: 4 }]}
        viewerEmail="traveler@example.com"
      />,
    )
    fireEvent.click(screen.getByText(en.booking.submitCta))
    await vi.waitFor(() => {
      expect(createCheckoutSessionActionMock).toHaveBeenCalledWith(expect.any(String), expect.any(Object), { locale: 'en' })
    })
  })
})
