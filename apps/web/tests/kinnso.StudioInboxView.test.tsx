// @vitest-environment jsdom
import { cleanup, render, screen, fireEvent, waitFor } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import en from '@/lib/i18n/messages/en'
import { StudioInboxView } from '@/components/kinnso/pages/StudioInboxView'

afterEach(cleanup)

const t = en.notifications

const notifications = [
  {
    id: 'n1', notificationType: 'payout_batch.paid', entityType: 'payout_batch', entityId: 'b1',
    payload: { currency: 'HKD', amount: 1500 }, readAt: null, createdAt: '2026-08-17T00:00:00Z',
  },
]

describe('StudioInboxView', () => {
  it('renders a notification, links it to the right page, and interpolates the payload into the text', () => {
    render(<StudioInboxView t={t as never} locale="en" notifications={notifications} markReadAction={vi.fn()} />)
    const link = screen.getByRole('link')
    expect(link.getAttribute('href')).toBe('/en/studio/earnings')
    expect(link.textContent).toContain('Your payout of 1500 HKD has been paid')
  })

  it('shows the empty state with no notifications', () => {
    render(<StudioInboxView t={t as never} locale="en" notifications={[]} markReadAction={vi.fn()} />)
    expect(screen.getByText(t.empty)).toBeTruthy()
  })

  it('marks a notification read when clicked', async () => {
    const markReadAction = vi.fn().mockResolvedValue({ ok: true, id: 'n1' })
    render(<StudioInboxView t={t as never} locale="en" notifications={notifications} markReadAction={markReadAction} />)
    fireEvent.click(screen.getByRole('link'))
    await waitFor(() => expect(markReadAction).toHaveBeenCalledWith('en', 'n1'))
  })

  it('does not call markReadAction again for an already-read notification', () => {
    const markReadAction = vi.fn()
    const read = [{ ...notifications[0], readAt: '2026-08-17T01:00:00Z' }]
    render(<StudioInboxView t={t as never} locale="en" notifications={read} markReadAction={markReadAction} />)
    fireEvent.click(screen.getByRole('link'))
    expect(markReadAction).not.toHaveBeenCalled()
  })
})
