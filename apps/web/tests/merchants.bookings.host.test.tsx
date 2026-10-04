// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { MerchantBookingsView } from '@/components/kinnso/pages/MerchantBookingsView'

afterEach(cleanup)

const messages = {
  title: 'Bookings',
  empty: 'No bookings yet.',
  colExperience: 'Experience',
  colTraveler: 'Traveller',
  colCreator: 'Booked via',
  colQty: 'Qty',
  colAmount: 'Amount',
  colStatus: 'Status',
  directLabel: 'Direct',
  markCompleteButton: 'Mark completed',
  statusPendingPayment: 'Awaiting payment',
  statusConfirmed: 'Confirmed',
  statusCompleted: 'Completed',
  statusCancelled: 'Cancelled',
  statusRefunded: 'Refunded',
}

describe('MerchantBookingsView', () => {
  it('renders the empty state with zero bookings', () => {
    render(
      <MerchantBookingsView locale="en" t={messages} bookings={[]} onComplete={vi.fn()} />,
    )
    expect(screen.getByText('No bookings yet.')).toBeInTheDocument()
  })

  it('renders a booking row with "Direct" attribution and a working complete button for confirmed bookings', () => {
    render(
      <MerchantBookingsView
        locale="en"
        t={messages}
        bookings={[
          {
            id: 'b1',
            experienceTitle: 'Hidden Waterfall Hike',
            status: 'confirmed',
            qty: 2,
            totalAmount: 900,
            currency: 'HKD',
            travelerLabel: 'tr***@example.com',
            creatorLabel: 'Direct',
            createdAt: '2026-07-04T00:00:00Z',
          },
        ]}
        onComplete={vi.fn()}
      />,
    )
    expect(screen.getByText('Hidden Waterfall Hike')).toBeInTheDocument()
    expect(screen.getByText('Direct')).toBeInTheDocument()
    expect(
      screen.getByRole('button', { name: 'Mark completed Hidden Waterfall Hike' }),
    ).toBeInTheDocument()
  })

  it('gives each "Mark completed" button a per-row accessible name so screen readers can tell rows apart', () => {
    render(
      <MerchantBookingsView
        locale="en"
        t={messages}
        bookings={[
          {
            id: 'b1',
            experienceTitle: 'Hidden Waterfall Hike',
            status: 'confirmed',
            qty: 2,
            totalAmount: 900,
            currency: 'HKD',
            travelerLabel: 'tr***@example.com',
            creatorLabel: 'Direct',
            createdAt: '2026-07-04T00:00:00Z',
          },
          {
            id: 'b2',
            experienceTitle: 'Sunset Kayak Tour',
            status: 'confirmed',
            qty: 1,
            totalAmount: 300,
            currency: 'HKD',
            travelerLabel: 'tr***@example.com',
            creatorLabel: 'Direct',
            createdAt: '2026-07-04T00:00:00Z',
          },
        ]}
        onComplete={vi.fn()}
      />,
    )
    expect(
      screen.getByRole('button', { name: 'Mark completed Hidden Waterfall Hike' }),
    ).toBeInTheDocument()
    expect(
      screen.getByRole('button', { name: 'Mark completed Sunset Kayak Tour' }),
    ).toBeInTheDocument()
  })

  it('updates the row to "Completed" and removes the complete button after a successful completion', async () => {
    const onComplete = vi.fn().mockResolvedValue({ ok: true, id: 'b1' })
    render(
      <MerchantBookingsView
        locale="en"
        t={messages}
        bookings={[
          {
            id: 'b1',
            experienceTitle: 'Hidden Waterfall Hike',
            status: 'confirmed',
            qty: 2,
            totalAmount: 900,
            currency: 'HKD',
            travelerLabel: 'tr***@example.com',
            creatorLabel: 'Direct',
            createdAt: '2026-07-04T00:00:00Z',
          },
        ]}
        onComplete={onComplete}
      />,
    )

    const button = screen.getByRole('button', { name: 'Mark completed Hidden Waterfall Hike' })
    fireEvent.click(button)

    await waitFor(() => expect(onComplete).toHaveBeenCalledWith('b1'))
    await waitFor(() => expect(screen.getByText('Completed')).toBeInTheDocument())
    expect(
      screen.queryByRole('button', { name: 'Mark completed Hidden Waterfall Hike' }),
    ).not.toBeInTheDocument()
  })

  it.each([
    ['pending_payment', 'b2'],
    ['completed', 'b3'],
    ['cancelled', 'b4'],
    ['refunded', 'b5'],
  ] as const)('does not render a complete button for a %s booking', (status, id) => {
    render(
      <MerchantBookingsView
        locale="en"
        t={messages}
        bookings={[
          {
            id,
            experienceTitle: 'Hidden Waterfall Hike',
            status,
            qty: 1,
            totalAmount: 450,
            currency: 'HKD',
            travelerLabel: 'tr***@example.com',
            creatorLabel: 'Direct',
            createdAt: '2026-07-04T00:00:00Z',
          },
        ]}
        onComplete={vi.fn()}
      />,
    )
    expect(
      screen.queryByRole('button', { name: 'Mark completed Hidden Waterfall Hike' }),
    ).not.toBeInTheDocument()
  })
})
