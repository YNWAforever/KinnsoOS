// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'

const refreshMock = vi.fn()
vi.mock('next/navigation', () => ({ useRouter: () => ({ refresh: refreshMock }) }))

import { AdminEnquiriesView } from '@/components/kinnso/admin/AdminEnquiriesView'
import en from '@/lib/i18n/messages/en'
import type { AdminEnquiry } from '@/lib/admin/enquiries-queries'

afterEach(() => { cleanup(); vi.clearAllMocks() })

const enquiries: AdminEnquiry[] = [
  { id: '11111111-1111-4111-8111-111111111111', type: 'creator_collab', name: 'Aiko', email: 'aiko@example.test', message: 'Please plan a collaboration with me.', status: 'new', createdAt: '2026-07-26T10:00:00.000Z', updatedAt: '2026-07-26T10:00:00.000Z', targetId: 'c1', targetName: 'Mei', targetSlug: 'mei-travels' },
  { id: '22222222-2222-4222-8222-222222222222', type: 'merchant_contact', name: 'Bo', email: 'bo@example.test', message: 'Could we discuss a partnership package?', status: 'in_progress', createdAt: '2026-07-25T10:00:00.000Z', updatedAt: '2026-07-25T10:00:00.000Z', targetId: 'm1', targetName: 'Tea House', targetSlug: 'tea-house' },
  { id: '33333333-3333-4333-8333-333333333333', type: 'creator_collab', name: 'Cy', email: 'cy@example.test', message: 'I have a follow-up collaboration proposal.', status: 'resolved', createdAt: '2026-07-24T10:00:00.000Z', updatedAt: '2026-07-24T10:00:00.000Z', targetId: null, targetName: null, targetSlug: null },
  { id: '44444444-4444-4444-8444-444444444444', type: 'merchant_contact', name: 'Di', email: 'di@example.test', message: 'Please reopen this merchant contact request.', status: 'spam', createdAt: '2026-07-23T10:00:00.000Z', updatedAt: '2026-07-23T10:00:00.000Z', targetId: 'm2', targetName: 'Hotel', targetSlug: 'hotel' },
]

function renderView(overrides: Partial<Parameters<typeof AdminEnquiriesView>[0]> = {}) {
  const onSetStatus = async () => ({ ok: true as const, status: 'in_progress' as const })
  return render(<AdminEnquiriesView locale="en" t={en.enquiriesAdmin} enquiries={enquiries} filters={{ status: 'active', type: 'all' }} onSetStatus={onSetStatus} {...overrides} />)
}

describe('AdminEnquiriesView', () => {
  it('shows sensitive enquiry content only in this already-guarded queue view and builds canonical target links', () => {
    renderView()
    expect(screen.getByText('Aiko')).toBeTruthy()
    expect(screen.getByText('aiko@example.test')).toBeTruthy()
    expect(screen.getByText('Please plan a collaboration with me.')).toBeTruthy()
    expect((screen.getByRole('link', { name: 'Mei' }) as HTMLAnchorElement).getAttribute('href')).toBe('/en/c/mei-travels')
    expect((screen.getByRole('link', { name: 'Tea House' }) as HTMLAnchorElement).getAttribute('href')).toBe('/en/m/tea-house')
    renderView({ enquiries: [{ ...enquiries[0], id: '55555555-5555-4555-8555-555555555555', targetName: 'Reserved', targetSlug: 'mei/sea?x#' }] })
    expect((screen.getByRole('link', { name: 'Reserved' }) as HTMLAnchorElement).getAttribute('href')).toBe('/en/c/mei%2Fsea%3Fx%23')
    expect(screen.queryByRole('link', { name: 'Cy' })).toBeNull()
  })

  it('renders only the database-approved actions for each current status', () => {
    renderView()
    expect(screen.getAllByRole('button', { name: en.enquiriesAdmin.markInProgress })).toHaveLength(1)
    expect(screen.getAllByRole('button', { name: en.enquiriesAdmin.markResolved })).toHaveLength(2)
    expect(screen.getAllByRole('button', { name: en.enquiriesAdmin.markSpam })).toHaveLength(2)
    expect(screen.getAllByRole('button', { name: en.enquiriesAdmin.reopen })).toHaveLength(2)
  })

  it('allows a new enquiry to start in progress without a reason', async () => {
    const onSetStatus = vi.fn(async () => ({ ok: true as const, status: 'in_progress' as const }))
    renderView({ onSetStatus })
    fireEvent.click(screen.getByRole('button', { name: en.enquiriesAdmin.markInProgress }))
    await waitFor(() => expect(onSetStatus).toHaveBeenCalledWith(enquiries[0].id, 'in_progress', ''))
  })

  it('requires a reason before terminal and reopen transitions', async () => {
    const onSetStatus = vi.fn(async () => ({ ok: true as const, status: 'in_progress' as const }))
    renderView({ onSetStatus })
    fireEvent.click(screen.getAllByRole('button', { name: en.enquiriesAdmin.markResolved })[0])
    expect(onSetStatus).not.toHaveBeenCalled()
    expect(screen.getByText(en.enquiriesAdmin.reasonRequired)).toBeTruthy()
    const reasons = screen.getAllByLabelText(en.enquiriesAdmin.reasonLabel)
    fireEvent.change(reasons[0], { target: { value: 'Handled by ops' } })
    fireEvent.click(screen.getAllByRole('button', { name: en.enquiriesAdmin.markResolved })[0])
    await waitFor(() => expect(onSetStatus).toHaveBeenCalledWith(enquiries[0].id, 'resolved', 'Handled by ops'))
    fireEvent.click(screen.getAllByRole('button', { name: en.enquiriesAdmin.reopen })[0])
    expect(screen.getAllByText(en.enquiriesAdmin.reasonRequired).length).toBeGreaterThan(0)
  })

  it('prevents duplicate per-row mutations while a row is pending', async () => {
    let release!: (value: { ok: true; status: 'in_progress' }) => void
    const onSetStatus = vi.fn(() => new Promise<{ ok: true; status: 'in_progress' }>((resolve) => { release = resolve }))
    renderView({ onSetStatus })
    const button = screen.getByRole('button', { name: en.enquiriesAdmin.markInProgress }) as HTMLButtonElement
    fireEvent.click(button)
    fireEvent.click(button)
    expect(onSetStatus).toHaveBeenCalledTimes(1)
    expect(button.disabled).toBe(true)
    release({ ok: true, status: 'in_progress' })
    await waitFor(() => expect(button.disabled).toBe(false))
  })

  it('retains a failed row and its reason with accessible feedback', async () => {
    const onSetStatus = vi.fn(async () => ({ ok: false as const, errors: { form: ['No permission'] } }))
    renderView({ onSetStatus })
    const reason = screen.getAllByLabelText(en.enquiriesAdmin.reasonLabel)[0] as HTMLInputElement
    fireEvent.change(reason, { target: { value: 'Completed elsewhere' } })
    fireEvent.click(screen.getAllByRole('button', { name: en.enquiriesAdmin.markResolved })[0])
    await waitFor(() => expect(screen.getByRole('alert')).toHaveTextContent(en.enquiriesAdmin.actionFailed))
    expect(reason.value).toBe('Completed elsewhere')
    expect(screen.getByText('Aiko')).toBeTruthy()
  })
  it('does not render a next link for 25 visible rows without a lookahead cursor', () => {
    const visibleRows = Array.from({ length: 25 }, (_, index) => ({ ...enquiries[0], id: `00000000-0000-4000-8000-${String(index + 1).padStart(12, '0')}` }))
    renderView({ enquiries: visibleRows, nextCursor: null })
    expect(screen.queryByRole('link', { name: en.enquiriesAdmin.next })).toBeNull()
  })

  it('builds a forward link from the displayed cursor while preserving filters and encoding its values', () => {
    renderView({
      filters: { status: 'spam', type: 'merchant_contact' },
      nextCursor: { createdAt: '2026-07-26T10:00:00.000Z', id: enquiries[0].id },
    })
    expect((screen.getByRole('link', { name: en.enquiriesAdmin.next }) as HTMLAnchorElement).getAttribute('href'))
      .toBe(`/en/admin/enquiries?status=spam&type=merchant_contact&cursorCreatedAt=${encodeURIComponent('2026-07-26T10:00:00.000Z')}&cursorId=${enquiries[0].id}`)
  })

  it('keeps independently pending rows disabled until each overlapping mutation completes', async () => {
    const rows = [enquiries[0], { ...enquiries[0], id: '66666666-6666-4666-8666-666666666666', name: 'Bea' }]
    const release: Record<string, (value: { ok: true; status: 'in_progress' }) => void> = {}
    const onSetStatus = vi.fn((id: string) => new Promise<{ ok: true; status: 'in_progress' }>((resolve) => { release[id] = resolve }))
    renderView({ enquiries: rows, onSetStatus })
    const buttons = screen.getAllByRole('button', { name: en.enquiriesAdmin.markInProgress }) as HTMLButtonElement[]
    fireEvent.click(buttons[0]); fireEvent.click(buttons[1])
    expect(buttons[0].disabled).toBe(true); expect(buttons[1].disabled).toBe(true)
    release[rows[0].id]({ ok: true, status: 'in_progress' })
    await waitFor(() => expect(buttons[0].disabled).toBe(false))
    expect(buttons[1].disabled).toBe(true)
    release[rows[1].id]({ ok: true, status: 'in_progress' })
    await waitFor(() => expect(buttons[1].disabled).toBe(false))
  })
})
