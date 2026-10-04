// apps/web/tests/kinnso.review-form.test.tsx
// @vitest-environment jsdom
import { render, screen, cleanup, fireEvent, waitFor } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { ActionResult } from '@/lib/admin/result'

const { submitReviewActionMock } = vi.hoisted(() => ({
  submitReviewActionMock: vi.fn(async (): Promise<ActionResult<{ bookingId: string }>> => ({ ok: true, bookingId: 'b1' })),
}))
vi.mock('@/lib/reviews/actions', () => ({ submitReviewAction: submitReviewActionMock }))

import { ReviewForm } from '@/components/kinnso/ReviewForm'
import en from '@/lib/i18n/messages/en'

afterEach(cleanup)

describe('ReviewForm', () => {
  it('disables submit until a star is picked, then submits the chosen rating and trimmed body', async () => {
    render(<ReviewForm locale="en" bookingId="b1" experienceId="e1" guideId={null} t={en.reviews} />)
    expect(screen.getByRole('button', { name: en.reviews.submitCta })).toBeDisabled()

    fireEvent.click(screen.getByRole('radio', { name: '4' }))
    fireEvent.change(screen.getByLabelText(en.reviews.bodyLabel), { target: { value: '  Great trip!  ' } })
    fireEvent.click(screen.getByRole('button', { name: en.reviews.submitCta }))

    await waitFor(() => expect(submitReviewActionMock).toHaveBeenCalledWith(
      'en', 'b1', 'e1', null, { rating: 4, body: '  Great trip!  ' },
    ))
    await screen.findByText(en.reviews.submitted)
  })

  it('translates the ALREADY_REVIEWED server error key to t.alreadyReviewed and lets the traveller retry', async () => {
    submitReviewActionMock.mockResolvedValueOnce({ ok: false, errors: { form: ['ALREADY_REVIEWED'] } })
    render(<ReviewForm locale="en" bookingId="b1" experienceId="e1" guideId="g1" t={en.reviews} />)
    fireEvent.click(screen.getByRole('radio', { name: '5' }))
    fireEvent.click(screen.getByRole('button', { name: en.reviews.submitCta }))
    await screen.findByText(en.reviews.alreadyReviewed)
    expect(screen.queryByText(en.reviews.submitted)).toBeNull()
  })

  it('translates the NOT_ELIGIBLE server error key to t.genericError', async () => {
    submitReviewActionMock.mockResolvedValueOnce({ ok: false, errors: { form: ['NOT_ELIGIBLE'] } })
    render(<ReviewForm locale="en" bookingId="b1" experienceId="e1" guideId="g1" t={en.reviews} />)
    fireEvent.click(screen.getByRole('radio', { name: '5' }))
    fireEvent.click(screen.getByRole('button', { name: en.reviews.submitCta }))
    await screen.findByText(en.reviews.genericError)
  })
})
