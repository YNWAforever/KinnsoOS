// @vitest-environment jsdom
import { cleanup, render, screen, fireEvent, waitFor } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import en from '@/lib/i18n/messages/en'
import { CreatorPayoutsView } from '@/components/kinnso/admin/creators/CreatorPayoutsView'

vi.mock('next/navigation', () => ({ usePathname: () => '/en/admin/creators/payouts' }))
afterEach(cleanup)

const t = en.creators
const queue = {
  rows: [
    { id: 's1', missionTitle: 'Mission One', source: 'affiliate' as const, creatorId: 'c1', status: 'pending', creatorPayoutStatus: 'pending',
      kinnsoCommissionStatus: 'pending', affiliateCommissionStatus: null, currency: 'USD',
      creatorCommissionAmount: 100, kinnsoCommissionAmount: 10, affiliateCommissionAmount: null, opsNote: null },
  ],
  summary: { total: 1, byStatus: { pending: 1 }, owed: [{ currency: 'USD', amount: 100 }], settled: [] },
}

describe('CreatorPayoutsView', () => {
  it('renders summary cards and the queue table', () => {
    render(<CreatorPayoutsView t={t} locale="en" queue={queue} status={undefined} action={vi.fn()} />)
    expect(screen.getByText(t.payoutsOwed)).toBeTruthy()
    expect(screen.getByText('Mission One')).toBeTruthy()
    expect(screen.getByText(t.actMarkPaid)).toBeTruthy()
  })

  it('shows the empty state when the filtered queue is empty', () => {
    render(<CreatorPayoutsView t={t} locale="en" queue={{ rows: [], summary: queue.summary }} status="paid" action={vi.fn()} />)
    expect(screen.getByText(t.payoutsEmpty)).toBeTruthy()
  })

  it('requires confirmation + reason before calling the action', async () => {
    const action = vi.fn().mockResolvedValue({ ok: true, id: 's1' })
    render(<CreatorPayoutsView t={t} locale="en" queue={queue} status={undefined} action={action} />)
    fireEvent.click(screen.getByText(t.actMarkPaid))
    fireEvent.change(screen.getByPlaceholderText(t.reasonPlaceholder), { target: { value: 'invoice cleared' } })
    fireEvent.click(screen.getByText(t.actApply))
    await waitFor(() => expect(action).toHaveBeenCalledWith('en', 's1',
      { status: 'paid', creatorPayoutStatus: 'paid', kinnsoCommissionStatus: 'paid', affiliateCommissionStatus: 'paid' },
      'invoice cleared'))
  })

  it('blocks confirm when the reason is blank', () => {
    const action = vi.fn()
    render(<CreatorPayoutsView t={t} locale="en" queue={queue} status={undefined} action={action} />)
    fireEvent.click(screen.getByText(t.actMarkPaid))
    fireEvent.click(screen.getByText(t.actApply))
    expect(action).not.toHaveBeenCalled()
  })
})
