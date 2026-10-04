// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { AdminBookingsView } from '@/components/kinnso/admin/bookings/AdminBookingsView'

afterEach(cleanup)

const messages = {
  title: 'Bookings & Settlements',
  empty: 'No bookings yet.',
  colExperience: 'Experience',
  colMerchantPayout: 'Merchant payout',
  colCreatorCommission: 'Creator commission',
  colKinnsoCommission: 'Kinnso commission',
  colStatus: 'Status',
  noCreatorLeg: 'No creator (direct booking)',
  markPaidButton: 'Mark all paid',
  reasonPlaceholder: 'Reason (required)',
  actionFailed: 'Action failed. Try again.',
}

describe('AdminBookingsView', () => {
  it('shows "No creator (direct booking)" when the creator leg is null', () => {
    render(
      <AdminBookingsView
        locale="en"
        t={messages}
        settlements={[
          {
            id: 's1',
            bookingId: 'b1',
            experienceTitle: 'Hidden Waterfall Hike',
            status: 'pending',
            merchantPayoutStatus: 'pending',
            merchantPayoutAmount: 900,
            creatorCommissionStatus: null,
            creatorCommissionAmount: null,
            kinnsoCommissionStatus: 'pending',
            kinnsoCommissionAmount: 100,
            currency: 'HKD',
          },
        ]}
        onMarkPaid={vi.fn()}
      />,
    )
    expect(screen.getByText('No creator (direct booking)')).toBeInTheDocument()
  })

  it('renders the empty state', () => {
    render(
      <AdminBookingsView
        locale="en"
        t={messages}
        settlements={[]}
        onMarkPaid={vi.fn()}
      />,
    )
    expect(screen.getByText('No bookings yet.')).toBeInTheDocument()
  })

  it('gives each row\'s mark-paid button a per-row accessible name', () => {
    render(
      <AdminBookingsView
        locale="en"
        t={messages}
        settlements={[
          {
            id: 's1',
            bookingId: 'b1',
            experienceTitle: 'Hidden Waterfall Hike',
            status: 'pending',
            merchantPayoutStatus: 'pending',
            merchantPayoutAmount: 900,
            creatorCommissionStatus: null,
            creatorCommissionAmount: null,
            kinnsoCommissionStatus: 'pending',
            kinnsoCommissionAmount: 100,
            currency: 'HKD',
          },
          {
            id: 's2',
            bookingId: 'b2',
            experienceTitle: 'Sunset Kayak Tour',
            status: 'pending',
            merchantPayoutStatus: 'pending',
            merchantPayoutAmount: 500,
            creatorCommissionStatus: 'pending',
            creatorCommissionAmount: 50,
            kinnsoCommissionStatus: 'pending',
            kinnsoCommissionAmount: 60,
            currency: 'HKD',
          },
        ]}
        onMarkPaid={vi.fn()}
      />,
    )
    expect(screen.getByRole('button', { name: 'Mark all paid Hidden Waterfall Hike' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Mark all paid Sunset Kayak Tour' })).toBeInTheDocument()
  })

  it('marks a direct booking (no creator leg) paid without asking the RPC to touch creatorCommissionStatus', async () => {
    const onMarkPaid = vi.fn().mockResolvedValue({ ok: true, id: 's1' })
    render(
      <AdminBookingsView
        locale="en"
        t={messages}
        settlements={[
          {
            id: 's1',
            bookingId: 'b1',
            experienceTitle: 'Hidden Waterfall Hike',
            status: 'pending',
            merchantPayoutStatus: 'pending',
            merchantPayoutAmount: 900,
            creatorCommissionStatus: null,
            creatorCommissionAmount: null,
            kinnsoCommissionStatus: 'pending',
            kinnsoCommissionAmount: 100,
            currency: 'HKD',
          },
        ]}
        onMarkPaid={onMarkPaid}
      />,
    )

    fireEvent.change(screen.getByPlaceholderText('Reason (required)'), { target: { value: 'Payout run 2026-07-05' } })
    fireEvent.click(screen.getByRole('button', { name: 'Mark all paid Hidden Waterfall Hike' }))

    // The regression: this used to unconditionally pass `hasCreatorLeg: true`
    // (hardcoded 'paid' downstream) for every settlement, including direct
    // bookings with no creator leg at all — tripping
    // admin_set_booking_settlement_status's `no_creator_leg` guard for what's
    // likely the majority of early bookings.
    await waitFor(() =>
      expect(onMarkPaid).toHaveBeenCalledWith('s1', 'Payout run 2026-07-05', false),
    )
  })

  it('marks a booking with a creator leg paid while telling the RPC that leg exists', async () => {
    const onMarkPaid = vi.fn().mockResolvedValue({ ok: true, id: 's2' })
    render(
      <AdminBookingsView
        locale="en"
        t={messages}
        settlements={[
          {
            id: 's2',
            bookingId: 'b2',
            experienceTitle: 'Sunset Kayak Tour',
            status: 'pending',
            merchantPayoutStatus: 'pending',
            merchantPayoutAmount: 500,
            creatorCommissionStatus: 'pending',
            creatorCommissionAmount: 50,
            kinnsoCommissionStatus: 'pending',
            kinnsoCommissionAmount: 60,
            currency: 'HKD',
          },
        ]}
        onMarkPaid={onMarkPaid}
      />,
    )

    fireEvent.change(screen.getByPlaceholderText('Reason (required)'), { target: { value: 'Payout run 2026-07-05' } })
    fireEvent.click(screen.getByRole('button', { name: 'Mark all paid Sunset Kayak Tour' }))

    await waitFor(() =>
      expect(onMarkPaid).toHaveBeenCalledWith('s2', 'Payout run 2026-07-05', true),
    )
  })
})
