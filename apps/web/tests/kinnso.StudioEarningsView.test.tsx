// @vitest-environment jsdom
import { afterEach, describe, expect, it } from 'vitest'
import { cleanup, render, screen } from '@testing-library/react'
import { StudioEarningsView } from '@/components/kinnso/pages/StudioEarningsView'
import en from '@/lib/i18n/messages/en'

afterEach(cleanup)

const empty = { missions: [], bookings: [], tracked: [], totals: [] }

const missions = [
  {
    id: 'ms1',
    missionTitle: 'Tokyo ramen crawl',
    missionType: 'paid',
    missionSource: 'merchant',
    currency: 'HKD',
    amount: 1200,
    payoutStatus: 'pending' as const,
  },
]
const bookings = [
  { id: 'bs1', experienceTitle: 'Sunset harbour walk', currency: 'HKD', amount: 80.5, payoutStatus: 'paid' as const },
]
const tracked = [
  { id: 'ev1', missionTitle: 'Flight deals', currency: 'USD', grossAmount: 15.25, eventState: 'processing' },
]

const payoutBatches = [
  {
    id: 'b1', currency: 'HKD', amount: 1500, status: 'pending' as const, targetAt: '2026-08-23T00:00:00Z',
    createdAt: '2026-08-16T00:00:00Z', paidAt: null, cancelledAt: null,
  },
  {
    id: 'b2', currency: 'TWD', amount: 900, status: 'paid' as const, targetAt: '2026-08-09T00:00:00Z',
    createdAt: '2026-08-01T00:00:00Z', paidAt: '2026-08-10T00:00:00Z', cancelledAt: null,
  },
  {
    id: 'b3', currency: 'USD', amount: 250, status: 'cancelled' as const, targetAt: '2026-07-30T00:00:00Z',
    createdAt: '2026-07-20T00:00:00Z', paidAt: null, cancelledAt: '2026-07-25T00:00:00Z',
  },
]

describe('StudioEarningsView', () => {
  it('shows a per-section empty state when the creator has nothing', () => {
    render(<StudioEarningsView t={en.studioEarnings} locale="en" data={empty} payoutBatches={[]} />)
    expect(screen.getByText(en.studioEarnings.missionsEmpty)).toBeTruthy()
    expect(screen.getByText(en.studioEarnings.bookingsEmpty)).toBeTruthy()
    expect(screen.getByText(en.studioEarnings.trackedEmpty)).toBeTruthy()
  })

  it('renders booking commission even when there are no mission settlements', () => {
    render(<StudioEarningsView t={en.studioEarnings} locale="en" data={{ ...empty, bookings }} payoutBatches={[]} />)
    expect(screen.getByText('Sunset harbour walk')).toBeTruthy()
    expect(screen.getByText(en.studioEarnings.missionsEmpty)).toBeTruthy()
  })

  it('renders all three sections with their headings', () => {
    render(
      <StudioEarningsView
        t={en.studioEarnings}
        locale="en"
        data={{ missions, bookings, tracked, totals: [{ currency: 'HKD', paid: 80.5, pending: 1200 }] }}
        payoutBatches={[]}
      />,
    )
    expect(screen.getByText(en.studioEarnings.missionsHeading)).toBeTruthy()
    expect(screen.getByText(en.studioEarnings.bookingsHeading)).toBeTruthy()
    expect(screen.getByText(en.studioEarnings.trackedHeading)).toBeTruthy()
    expect(screen.getByText('Tokyo ramen crawl')).toBeTruthy()
    expect(document.querySelector('.k-ticket')).toBeTruthy()
  })

  it('states that tracked volume is not payable', () => {
    render(<StudioEarningsView t={en.studioEarnings} locale="en" data={{ ...empty, tracked, totals: [] }} payoutBatches={[]} />)
    expect(screen.getByText(en.studioEarnings.trackedNote)).toBeTruthy()
    // The row itself IS shown — it is real, recorded volume.
    expect(screen.getByText('Flight deals')).toBeTruthy()
  })

  it('renders no totals card when the only money is tracked, not payable', () => {
    render(<StudioEarningsView t={en.studioEarnings} locale="en" data={{ ...empty, tracked, totals: [] }} payoutBatches={[]} />)
    // A totals card renders a ReceiptRow labelled t.paid; the mission/booking tables are
    // empty here, so no status badge can supply that text either. Its absence proves the
    // USD tracked row did not manufacture a USD totals card.
    expect(screen.queryByText(en.studioEarnings.paid)).toBeNull()
    expect(screen.queryByText(en.studioEarnings.pending)).toBeNull()
  })

  it('renders a payout batches section when batches exist', () => {
    render(<StudioEarningsView t={en.studioEarnings} locale="en" data={empty} payoutBatches={payoutBatches} />)
    expect(screen.getByText(en.studioEarnings.payoutBatchesHeading)).toBeTruthy()
    // Currency and amount render as adjacent text nodes within one cell ("HKD" then the
    // locale-formatted amount); match on the currency substring rather than the full text so
    // this doesn't depend on Number.prototype.toLocaleString()'s locale-dependent formatting.
    expect(screen.getByText(/HKD/)).toBeTruthy()
    // All three PayoutBatchStatus values render their own distinct badge label.
    expect(screen.getByText(en.studioEarnings.pending)).toBeTruthy()
    expect(screen.getByText(en.studioEarnings.paid)).toBeTruthy()
    expect(screen.getByText(en.studioEarnings.batchCancelled)).toBeTruthy()
  })

  it('renders the target date using the passed locale, not the runtime default', () => {
    const batch = {
      id: 'bd', currency: 'HKD', amount: 100, status: 'pending' as const, targetAt: '2026-08-23T00:00:00Z',
      createdAt: '2026-08-16T00:00:00Z', paidAt: null, cancelledAt: null,
    }
    render(<StudioEarningsView t={en.studioEarnings} locale="ja" data={empty} payoutBatches={[batch]} />)
    // Deliberately a non-'en' locale: in this runtime 'en' happens to format identically to the
    // no-argument default ("8/23/2026" either way), so asserting with 'en' would pass even if the
    // component silently ignored the `locale` prop and called toLocaleDateString() bare — exactly
    // the regression 27323f0 fixed. 'ja' renders this date as "2026/8/23", visibly different from
    // the runtime default, so a match here proves `locale` actually reaches the date call.
    // Computed via the same API rather than hardcoded, so this doesn't bit-rot if a future Node's
    // ICU data formats 'ja' dates differently.
    expect(screen.getByText(new Date(batch.targetAt).toLocaleDateString('ja'))).toBeTruthy()
  })

  it('shows the empty state with no payout batches', () => {
    render(<StudioEarningsView t={en.studioEarnings} locale="en" data={empty} payoutBatches={[]} />)
    expect(screen.getByText(en.studioEarnings.payoutBatchesEmpty)).toBeTruthy()
  })
})
