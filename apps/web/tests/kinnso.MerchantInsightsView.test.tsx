// @vitest-environment jsdom
import { render, screen, cleanup } from '@testing-library/react'
import { afterEach, describe, expect, it } from 'vitest'
import { MerchantInsightsView } from '@/components/kinnso/pages/MerchantInsightsView'
import en from '@/lib/i18n/messages/en'
import type { MerchantInsights } from '@/lib/insights/merchant'

afterEach(cleanup)

const base: MerchantInsights = {
  missionsPublished: 2,
  perMission: [
    { missionId: 'm1', title: 'Summer brief', status: 'published',
      invited: 4, applied: 1, active: 2, rejected: 1, approvedSubmissions: 2 },
  ],
  totals: { participants: 5, invited: 4, accepted: 2, approvedSubmissions: 2 },
  inviteAcceptRate: 0.5,
  visitsDriven: [],
}

describe('MerchantInsightsView', () => {
  it('renders aggregate stats and the per-mission row', () => {
    render(<MerchantInsightsView t={en.insights} data={base} />)
    expect(screen.getByRole('heading', { level: 1, name: en.insights.merchantTitle })).toBeTruthy()
    expect(screen.getByText('Summer brief')).toBeTruthy()
    expect(screen.getByText('50%')).toBeTruthy() // acceptance rate
  })

  it('renders the dash when acceptance rate is null', () => {
    render(<MerchantInsightsView t={en.insights} data={{ ...base, inviteAcceptRate: null }} />)
    expect(screen.getAllByText(en.insights.notApplicable).length).toBeGreaterThan(0)
  })

  it('shows the empty state when there are no missions', () => {
    render(<MerchantInsightsView t={en.insights} data={{ ...base, perMission: [], missionsPublished: 0 }} />)
    expect(screen.getByText(en.insights.merchantEmpty)).toBeTruthy()
  })
})
