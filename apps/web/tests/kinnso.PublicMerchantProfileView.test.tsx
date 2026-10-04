// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, render, screen } from '@testing-library/react'

const dialogProps = vi.hoisted(() => ({ value: null as Record<string, unknown> | null }))
vi.mock('@/components/kinnso/enquiries/EnquiryDialog', () => ({
  EnquiryDialog: (props: Record<string, unknown>) => {
    dialogProps.value = props
    return <button type="button">{props.triggerLabel as string}</button>
  },
}))
import { PublicMerchantProfileView } from '@/components/kinnso/pages/PublicMerchantProfileView'
import en from '@/lib/i18n/messages/en'
afterEach(cleanup)
const View = PublicMerchantProfileView as unknown as (props: Record<string, unknown>) => React.ReactNode
const merchant = { id: '123e4567-e89b-42d3-a456-426614174000', slug: 'acme', companyName: 'Acme Travel', tagline: null, city: 'Hong Kong', logoUrl: null, websiteUrl: null }
const experiences = [{ id: 'exp-1', slug: 'harbour-tour', title: 'Harbour tour', summary: null, description: null, city: 'Hong Kong', priceAmount: 480, currency: 'HKD', durationMinutes: null, coverUrl: null, publishedAt: null, savesCount: 0, merchant: { slug: '', companyName: '' } }]
const guide = { slug: 'harbour-guide', title: 'Harbour guide', cover: null, city: 'Hong Kong', saves: 10, creatorHandle: 'ada' }
function renderMerchant(overrides: Record<string, unknown> = {}) { return render(<View locale="en" t={en.merchantProfile} enquiry={en.enquiry} booking={en.booking} merchant={merchant} experiences={experiences} featuredGuides={[]} bookingLive {...overrides} />) }
describe('PublicMerchantProfileView', () => {
  it('uses the live booking label, formatted experience currency, and an interactive experience route', () => {
    renderMerchant({ bookingLive: true })
    expect(screen.getAllByText(/Book now/)).not.toHaveLength(0)
    expect(screen.getByText(/HK\$480\.00/)).toBeVisible()
    expect(screen.getByRole('link', { name: /Harbour tour/i })).toHaveAttribute('href', '/en/experiences/harbour-tour')
  })
  it('uses the booking-soon label without disabling experience navigation', () => {
    renderMerchant({ bookingLive: false })
    expect(screen.getAllByText(/Booking opens soon/)).not.toHaveLength(0)
    expect(screen.getByRole('link', { name: /Harbour tour/i })).toHaveAttribute('href', '/en/experiences/harbour-tour')
  })
  it('omits empty featured guides and uses the canonical guide route when attributed data exists', () => {
    const { rerender } = renderMerchant({ featuredGuides: [] })
    expect(screen.queryByRole('heading', { name: en.merchantProfile.featuredGuidesHeading })).not.toBeInTheDocument()
    rerender(<View locale="en" t={en.merchantProfile} enquiry={en.enquiry} booking={en.booking} merchant={merchant} experiences={experiences} featuredGuides={[guide]} bookingLive />)
    expect(screen.getByRole('heading', { name: en.merchantProfile.featuredGuidesHeading })).toBeVisible()
    expect(screen.getByRole('link', { name: /Harbour guide/i })).toHaveAttribute('href', '/en/g/harbour-guide')
  })
  it('wires the safe merchant enquiry CTA only for a valid target UUID', () => {
    renderMerchant()
    expect(screen.getByRole('button', { name: en.merchantProfile.enquiryCta })).toBeVisible()
    expect(dialogProps.value).toMatchObject({
      type: 'merchant_contact',
      targetId: merchant.id,
      targetName: merchant.companyName,
      triggerLabel: en.merchantProfile.enquiryCta,
      t: en.enquiry,
    })
  })
  it('omits the enquiry CTA when the merchant id is invalid', () => {
    renderMerchant({ merchant: { ...merchant, id: 'merchant-1' } })
    expect(screen.queryByRole('button', { name: en.merchantProfile.enquiryCta })).not.toBeInTheDocument()
  })
  it('renders merchant CTA and featured heading from the supplied dictionary', () => {
    const t = {
      ...en.merchantProfile,
      enquiryCta: 'Localized merchant contact',
      featuredGuidesHeading: 'Localized guide attribution',
    }
    renderMerchant({ t, featuredGuides: [guide] })
    expect(screen.getByRole('button', { name: t.enquiryCta })).toBeVisible()
    expect(screen.getByRole('heading', { name: t.featuredGuidesHeading })).toBeVisible()
  })
})
