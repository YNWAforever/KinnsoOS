// @vitest-environment jsdom
import { cleanup, render, screen, fireEvent, waitFor } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'

const refreshMock = vi.fn()
vi.mock('next/navigation', () => ({ useRouter: () => ({ refresh: refreshMock }) }))

import { AdminTestimonialsView } from '@/components/kinnso/admin/AdminTestimonialsView'
import en from '@/lib/i18n/messages/en'
import type { AdminTestimonial } from '@/lib/admin/testimonials-queries'

afterEach(() => {
  cleanup()
  vi.clearAllMocks()
})

const t = en.testimonialsAdmin

const published: AdminTestimonial = {
  id: 't1', quote: 'KINNSO changed how I travel', author_name: 'Mina', author_role: 'creator',
  locale: null, sort_order: 0, status: 'published', created_at: '2026-06-26T00:00:00Z', updated_at: '2026-06-26T00:00:00Z',
}
const draft: AdminTestimonial = {
  id: 't2', quote: 'Missions pay for my trips', author_name: 'Ken', author_role: 'merchant',
  locale: 'ja', sort_order: 1, status: 'draft', created_at: '2026-06-26T00:00:00Z', updated_at: '2026-06-26T00:00:00Z',
}

const saveOk = async () => ({ ok: true as const, id: 't1' })
const mutateOk = async () => ({ ok: true as const, id: 't1' })

function renderView(overrides: Partial<Parameters<typeof AdminTestimonialsView>[0]> = {}) {
  return render(
    <AdminTestimonialsView
      t={t}
      testimonials={[published, draft]}
      onCreate={saveOk}
      onUpdate={saveOk}
      onSetStatus={mutateOk}
      onDelete={mutateOk}
      {...overrides}
    />,
  )
}

describe('AdminTestimonialsView', () => {
  it('lists testimonial rows with author, role, locale, and status', () => {
    renderView()
    expect(screen.getByText(/KINNSO changed how I travel/)).toBeTruthy()
    expect(screen.getByText(/Missions pay for my trips/)).toBeTruthy()
    expect(screen.getByText(new RegExp(`Mina · ${t.roleCreator} · ${t.localeAll} · #0`))).toBeTruthy()
    expect(screen.getByText(new RegExp(`Ken · ${t.roleMerchant} · ja · #1`))).toBeTruthy()
    expect(screen.getByText(t.statusPublished)).toBeTruthy()
    expect(screen.getByText(t.statusDraft)).toBeTruthy()
  })

  it('shows the empty state with no testimonials', () => {
    renderView({ testimonials: [] })
    expect(screen.getByText(t.empty)).toBeTruthy()
  })

  it('opens the create form and submits the new testimonial through onCreate, then refreshes', async () => {
    const onCreate = vi.fn(saveOk)
    renderView({ testimonials: [], onCreate })
    fireEvent.click(screen.getByText(t.newCta))
    expect(screen.getByText(t.formNewTitle)).toBeTruthy()
    fireEvent.change(screen.getByLabelText(t.formQuote), { target: { value: 'Best trip ever' } })
    fireEvent.change(screen.getByLabelText(t.formAuthorName), { target: { value: 'Yuki' } })
    fireEvent.click(screen.getByText(t.formSave))
    await waitFor(() =>
      expect(onCreate).toHaveBeenCalledWith({
        quote: 'Best trip ever', authorName: 'Yuki', authorRole: 'creator', locale: null, sortOrder: 0,
      }),
    )
    await waitFor(() => expect(refreshMock).toHaveBeenCalled())
  })

  it('surfaces field errors from a failing create (no silent no-op)', async () => {
    const onCreate = vi.fn(async () => ({ ok: false as const, errors: { quote: ['Quote is required'] } }))
    renderView({ testimonials: [], onCreate })
    fireEvent.click(screen.getByText(t.newCta))
    fireEvent.click(screen.getByText(t.formSave))
    await waitFor(() => expect(screen.getByText('Quote is required')).toBeTruthy())
    expect(refreshMock).not.toHaveBeenCalled()
  })

  it('unpublishes a published row via onSetStatus(id, draft) and refreshes', async () => {
    const onSetStatus = vi.fn(mutateOk)
    renderView({ onSetStatus })
    fireEvent.click(screen.getByText(t.actUnpublish))
    await waitFor(() => expect(onSetStatus).toHaveBeenCalledWith('t1', 'draft'))
    await waitFor(() => expect(refreshMock).toHaveBeenCalled())
  })

  it('publishes a draft row via onSetStatus(id, published)', async () => {
    const onSetStatus = vi.fn(mutateOk)
    renderView({ onSetStatus })
    fireEvent.click(screen.getByText(t.actPublish))
    await waitFor(() => expect(onSetStatus).toHaveBeenCalledWith('t2', 'published'))
  })

  it('surfaces the action error when a status change fails', async () => {
    const onSetStatus = vi.fn(async () => ({ ok: false as const, errors: { form: ['Active ops access is required.'] } }))
    renderView({ onSetStatus })
    fireEvent.click(screen.getByText(t.actUnpublish))
    await waitFor(() => expect(screen.getByText(/active ops access/i)).toBeTruthy())
    expect(refreshMock).not.toHaveBeenCalled()
  })

  it('clears the busy state and shows a row error when onSetStatus rejects (not just resolves false)', async () => {
    const onSetStatus = vi.fn(async () => { throw new Error('network blip') })
    renderView({ onSetStatus })
    const unpublishButton = screen.getByText(t.actUnpublish) as HTMLButtonElement
    fireEvent.click(unpublishButton)
    await waitFor(() => expect(onSetStatus).toHaveBeenCalled())
    // Busy state must clear (button re-enabled) even though the action threw.
    await waitFor(() => expect(unpublishButton.disabled).toBe(false))
    await waitFor(() => expect(screen.getByText(t.colStatus)).toBeTruthy())
    expect(refreshMock).not.toHaveBeenCalled()
  })

  it('deletes a row through onDelete after the confirm dialog is accepted', async () => {
    const confirmSpy = vi.spyOn(window, 'confirm').mockReturnValue(true)
    const onDelete = vi.fn(mutateOk)
    renderView({ testimonials: [published], onDelete })
    fireEvent.click(screen.getByText(t.actDelete))
    expect(confirmSpy).toHaveBeenCalledWith(t.deleteConfirm)
    await waitFor(() => expect(onDelete).toHaveBeenCalledWith('t1'))
    await waitFor(() => expect(refreshMock).toHaveBeenCalled())
    confirmSpy.mockRestore()
  })

  it('does not delete when the confirm dialog is dismissed', async () => {
    const confirmSpy = vi.spyOn(window, 'confirm').mockReturnValue(false)
    const onDelete = vi.fn(mutateOk)
    renderView({ testimonials: [published], onDelete })
    fireEvent.click(screen.getByText(t.actDelete))
    expect(onDelete).not.toHaveBeenCalled()
    confirmSpy.mockRestore()
  })
})
