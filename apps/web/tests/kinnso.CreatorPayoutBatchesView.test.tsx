// @vitest-environment jsdom
import { cleanup, render, screen, fireEvent, waitFor } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import en from '@/lib/i18n/messages/en'
import { CreatorPayoutBatchesView } from '@/components/kinnso/admin/creators/CreatorPayoutBatchesView'

afterEach(cleanup)

const t = en.creators

const batches = [
  {
    id: 'b1', creatorId: 'c1', creatorName: 'May Chan', currency: 'HKD', amount: 1500,
    status: 'pending' as const, targetAt: '2026-08-23T00:00:00Z', createdAt: '2026-08-16T00:00:00Z',
    paidAt: null, cancelledAt: null,
  },
]

describe('CreatorPayoutBatchesView', () => {
  it('renders the batches table', () => {
    render(<CreatorPayoutBatchesView t={t} locale="en" batches={batches}
      createAction={vi.fn()} markPaidAction={vi.fn()} cancelAction={vi.fn()} />)
    expect(screen.getByText(t.batchesHeading)).toBeTruthy()
    expect(screen.getByText('May Chan')).toBeTruthy()
    expect(screen.getByText(t.actMarkPaid)).toBeTruthy()
    expect(screen.getByText(t.actCancelBatch)).toBeTruthy()
    // The settlement queue directly above this table on the same page links its identical
    // truncated-creator-id pattern to the creator detail page; this table should too.
    const creatorLink = screen.getByRole('link', { name: 'May Chan' })
    expect(creatorLink.getAttribute('href')).toBe('/en/admin/creators/c1')
  })

  it('shows the empty state with no batches', () => {
    render(<CreatorPayoutBatchesView t={t} locale="en" batches={[]}
      createAction={vi.fn()} markPaidAction={vi.fn()} cancelAction={vi.fn()} />)
    expect(screen.getByText(t.batchesEmpty)).toBeTruthy()
  })

  it('disables mark-paid and cancel for a batch that already left pending', () => {
    const paid = { ...batches[0], id: 'b2', status: 'paid' as const, paidAt: '2026-08-17T00:00:00Z' }
    render(<CreatorPayoutBatchesView t={t} locale="en" batches={[paid]}
      createAction={vi.fn()} markPaidAction={vi.fn()} cancelAction={vi.fn()} />)
    expect(screen.queryByText(t.actMarkPaid)).toBeNull()
    expect(screen.queryByText(t.actCancelBatch)).toBeNull()
  })

  it('creating a batch requires a reason and submits the form fields', async () => {
    const createAction = vi.fn().mockResolvedValue({ ok: true, batchId: 'b9' })
    render(<CreatorPayoutBatchesView t={t} locale="en" batches={[]}
      createAction={createAction} markPaidAction={vi.fn()} cancelAction={vi.fn()} />)
    fireEvent.click(screen.getByText(t.actCreateBatch))
    fireEvent.change(screen.getByPlaceholderText(t.formCreatorId), { target: { value: 'c9' } })
    fireEvent.change(screen.getByPlaceholderText(t.formCurrency), { target: { value: 'usd' } })
    fireEvent.change(screen.getByPlaceholderText(t.formAmount), { target: { value: '250' } })
    fireEvent.change(screen.getByPlaceholderText(t.reasonPlaceholder), { target: { value: 'August payout run' } })
    fireEvent.click(screen.getByText(t.actApply))
    await waitFor(() => expect(createAction).toHaveBeenCalledTimes(1))
    const [locale, input, reason] = createAction.mock.calls[0]
    expect(locale).toBe('en')
    expect(input).toMatchObject({ creatorId: 'c9', currency: 'usd', amount: 250 })
    expect(typeof input.idempotencyKey).toBe('string')
    expect(input.idempotencyKey.length).toBeGreaterThan(0)
    expect(reason).toBe('August payout run')
  })

  it('blocks create-confirm when amount is not a valid positive number', () => {
    const createAction = vi.fn()
    render(<CreatorPayoutBatchesView t={t} locale="en" batches={[]}
      createAction={createAction} markPaidAction={vi.fn()} cancelAction={vi.fn()} />)
    fireEvent.click(screen.getByText(t.actCreateBatch))
    fireEvent.change(screen.getByPlaceholderText(t.formCreatorId), { target: { value: 'c9' } })
    fireEvent.change(screen.getByPlaceholderText(t.formCurrency), { target: { value: 'usd' } })
    fireEvent.change(screen.getByPlaceholderText(t.formAmount), { target: { value: '0' } })
    fireEvent.change(screen.getByPlaceholderText(t.reasonPlaceholder), { target: { value: 'reason' } })
    fireEvent.click(screen.getByText(t.actApply))
    expect(createAction).not.toHaveBeenCalled()
  })

  it('marking paid requires confirmation and a reason', async () => {
    const markPaidAction = vi.fn().mockResolvedValue({ ok: true, id: 'b1' })
    render(<CreatorPayoutBatchesView t={t} locale="en" batches={batches}
      createAction={vi.fn()} markPaidAction={markPaidAction} cancelAction={vi.fn()} />)
    fireEvent.click(screen.getByText(t.actMarkPaid))
    fireEvent.change(screen.getByPlaceholderText(t.reasonPlaceholder), { target: { value: 'wired via FPS' } })
    fireEvent.click(screen.getByText(t.actApply))
    await waitFor(() => expect(markPaidAction).toHaveBeenCalledWith('en', 'b1', 'wired via FPS'))
  })

  it('cancelling passes a deterministic idempotency key derived from the batch id, and a reason', async () => {
    const cancelAction = vi.fn().mockResolvedValue({ ok: true, id: 'b1' })
    render(<CreatorPayoutBatchesView t={t} locale="en" batches={batches}
      createAction={vi.fn()} markPaidAction={vi.fn()} cancelAction={cancelAction} />)
    fireEvent.click(screen.getByText(t.actCancelBatch))
    fireEvent.change(screen.getByPlaceholderText(t.reasonPlaceholder), { target: { value: 'wrong currency' } })
    fireEvent.click(screen.getByText(t.actApply))
    await waitFor(() => expect(cancelAction).toHaveBeenCalledTimes(1))
    const [locale, input, reason] = cancelAction.mock.calls[0]
    expect(locale).toBe('en')
    expect(input.batchId).toBe('b1')
    // Deterministic (not random) so a retry of the exact same cancel is recognized by the
    // RPC as a safe replay rather than a new attempt — see confirm()'s cancel branch.
    expect(input.idempotencyKey).toBe('payout-cancel-b1')
    expect(reason).toBe('wrong currency')
  })

  it('reuses the same create idempotency key across a retried submission in one dialog session', async () => {
    const createAction = vi.fn()
      .mockResolvedValueOnce({ ok: false, errors: { form: ['temporary failure'] } })
      .mockResolvedValueOnce({ ok: true, batchId: 'b9' })
    render(<CreatorPayoutBatchesView t={t} locale="en" batches={[]}
      createAction={createAction} markPaidAction={vi.fn()} cancelAction={vi.fn()} />)
    fireEvent.click(screen.getByText(t.actCreateBatch))
    fireEvent.change(screen.getByPlaceholderText(t.formCreatorId), { target: { value: 'c9' } })
    fireEvent.change(screen.getByPlaceholderText(t.formCurrency), { target: { value: 'usd' } })
    fireEvent.change(screen.getByPlaceholderText(t.formAmount), { target: { value: '250' } })
    fireEvent.change(screen.getByPlaceholderText(t.reasonPlaceholder), { target: { value: 'August payout run' } })
    fireEvent.click(screen.getByText(t.actApply))
    await waitFor(() => expect(createAction).toHaveBeenCalledTimes(1))
    // First attempt failed; the dialog stays open (confirm() only closes on res.ok). Retry
    // without closing/reopening — this must reuse the same key, not mint a new one. The Apply
    // button is disabled while isPending, and disabled buttons don't dispatch click events at
    // all — waiting only on the call count races the button re-enabling after the first
    // transition settles, so wait for it to be enabled again before the second click.
    await waitFor(() => expect(screen.getByText(t.actApply)).not.toBeDisabled())
    fireEvent.click(screen.getByText(t.actApply))
    await waitFor(() => expect(createAction).toHaveBeenCalledTimes(2))
    const firstKey = createAction.mock.calls[0][1].idempotencyKey
    const secondKey = createAction.mock.calls[1][1].idempotencyKey
    expect(secondKey).toBe(firstKey)
    expect(secondKey.length).toBeGreaterThan(0)
  })
})
