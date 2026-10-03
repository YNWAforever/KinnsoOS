// apps/web/tests/kinnso.MerchantDashboardHomeView.test.tsx
// @vitest-environment jsdom
import { cleanup, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it } from 'vitest'
import { MerchantDashboardHomeView } from '@/components/kinnso/pages/MerchantDashboardHomeView'
import en from '@/lib/i18n/messages/en'
import { LOCALES } from '@/lib/i18n/config'

afterEach(cleanup)

const hrefs = () =>
  screen.getAllByRole('link').map((a) => a.getAttribute('href'))

describe('MerchantDashboardHomeView', () => {
  // R12.0 shipped /merchants/dashboard/offers and /redeem but linked neither, so
  // merchant staff could not reach the redemption scanner from the product at
  // all -- the visit loop was completable only by typing the URL.
  it('links the offers surface', () => {
    render(<MerchantDashboardHomeView locale="en" t={en.merchantDashboard} />)
    expect(hrefs()).toContain('/en/merchants/dashboard/offers')
  })

  it('links the in-store redemption scanner', () => {
    render(<MerchantDashboardHomeView locale="en" t={en.merchantDashboard} />)
    expect(hrefs()).toContain('/en/merchants/dashboard/redeem')
  })

  it('keeps every dashboard destination reachable', () => {
    render(<MerchantDashboardHomeView locale="en" t={en.merchantDashboard} />)
    expect(hrefs()).toEqual([
      '/en/merchants/dashboard/post',
      '/en/merchants/dashboard/missions',
      '/en/merchants/dashboard/creators',
      '/en/merchants/dashboard/insights',
      '/en/merchants/dashboard/experiences',
      '/en/merchants/dashboard/bookings',
      '/en/merchants/dashboard/offers',
      '/en/merchants/dashboard/redeem',
      '/en/merchants/dashboard/profile',
      '/en/merchants/dashboard/budget',
    ])
  })

  it('prefixes every link with the active locale', () => {
    for (const locale of LOCALES) {
      cleanup()
      render(<MerchantDashboardHomeView locale={locale} t={en.merchantDashboard} />)
      const unprefixed = hrefs().filter((h) => !h?.startsWith(`/${locale}/`))
      expect(unprefixed, `locale ${locale}`).toEqual([])
    }
  })

  it('gives the new cards real copy rather than a key name', () => {
    render(<MerchantDashboardHomeView locale="en" t={en.merchantDashboard} />)
    expect(screen.getByText(en.merchantDashboard.cardOffersTitle)).toBeInTheDocument()
    expect(screen.getByText(en.merchantDashboard.cardRedeemTitle)).toBeInTheDocument()
    expect(en.merchantDashboard.cardOffersBody.length).toBeGreaterThan(10)
    expect(en.merchantDashboard.cardRedeemBody.length).toBeGreaterThan(10)
  })
})
