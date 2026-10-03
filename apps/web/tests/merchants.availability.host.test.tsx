// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, render, screen } from '@testing-library/react'
import { MerchantAvailabilityView } from '@/components/kinnso/pages/MerchantAvailabilityView'
import en from '@/lib/i18n/messages/en'

vi.mock('next/navigation', () => ({ useRouter: () => ({ refresh: vi.fn() }) }))

afterEach(cleanup)

describe('MerchantAvailabilityView', () => {
  it('renders the experience title, empty state, and add-date form', () => {
    render(
      <MerchantAvailabilityView
        locale="en"
        t={en.merchantDashboard}
        experienceId="exp1"
        experienceTitle="Tokyo After-Hours Izakaya Crawl"
        availability={[]}
      />,
    )
    expect(screen.getByText('Tokyo After-Hours Izakaya Crawl')).toBeInTheDocument()
    expect(screen.getByText(en.merchantDashboard.availEmpty)).toBeInTheDocument()
    expect(screen.getByText(en.merchantDashboard.addDateCta)).toBeInTheDocument()
  })

  it('renders existing availability rows with booked/capacity and status', () => {
    render(
      <MerchantAvailabilityView
        locale="en"
        t={en.merchantDashboard}
        experienceId="exp1"
        experienceTitle="Tokyo After-Hours Izakaya Crawl"
        availability={[{ id: 'a1', date: '2026-08-01', capacity: 10, bookedCount: 2, status: 'open' }]}
      />,
    )
    expect(screen.getByText('2026-08-01')).toBeInTheDocument()
    expect(screen.getByText(en.merchantDashboard.actClose)).toBeInTheDocument()
  })

  it('does not render a close button for an already-closed date', () => {
    render(
      <MerchantAvailabilityView
        locale="en"
        t={en.merchantDashboard}
        experienceId="exp1"
        experienceTitle="Tokyo After-Hours Izakaya Crawl"
        availability={[{ id: 'a1', date: '2026-08-01', capacity: 10, bookedCount: 10, status: 'closed' }]}
      />,
    )
    expect(screen.queryByText(en.merchantDashboard.actClose)).not.toBeInTheDocument()
  })
})
