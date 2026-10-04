// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import en from '@/lib/i18n/messages/en'

const { submitMock } = vi.hoisted(() => ({ submitMock: vi.fn() }))

vi.mock('@/lib/enquiries/actions', () => ({ submitEnquiryAction: submitMock }))

import { EnquiryDialog } from '@/components/kinnso/enquiries/EnquiryDialog'

function renderDialog(triggerLabel = 'Work with Ada') {
  return render(
    <EnquiryDialog
      type="creator_collab"
      targetId="6cfdd34f-3305-4c58-9082-ec331e2afdf0"
      targetName="Ada Wong"
      triggerLabel={triggerLabel}
      t={en.enquiry}
    />,
  )
}


async function dismissThroughOverlay() {
  await new Promise((resolve) => setTimeout(resolve, 0))
  const overlay = document.querySelector('[data-slot="dialog-overlay"]')!
  fireEvent.pointerDown(overlay)
  fireEvent.pointerUp(overlay)
  fireEvent.click(overlay)
  await new Promise((resolve) => setTimeout(resolve, 0))
}
function fillIncompleteForm() {
  fireEvent.change(screen.getByLabelText('Name'), { target: { value: 'Ada Client' } })
  fireEvent.change(screen.getByLabelText('Message'), { target: { value: 'A genuine campaign enquiry.' } })
}

async function openAndFill() {
  fireEvent.click(screen.getByRole('button', { name: 'Work with Ada' }))
  fireEvent.change(screen.getByLabelText('Name'), { target: { value: 'Ada Client' } })
  fireEvent.change(screen.getByLabelText('Email'), { target: { value: 'client@example.com' } })
  fireEvent.change(screen.getByLabelText('Message'), { target: { value: 'A genuine campaign enquiry.' } })
}

afterEach(cleanup)

beforeEach(() => {
  submitMock.mockReset()
  submitMock.mockResolvedValue({ ok: true })
})

describe('EnquiryDialog review regressions', () => {
  it('submits a malformed email to the action and announces localized invalid feedback', async () => {
    submitMock.mockResolvedValue({ ok: false, error: 'invalid' })
    renderDialog()
    fireEvent.click(screen.getByRole('button', { name: 'Work with Ada' }))
    fillIncompleteForm()
    fireEvent.change(screen.getByLabelText('Email'), { target: { value: 'not-an-email' } })

    fireEvent.click(screen.getByRole('button', { name: 'Send enquiry' }))

    await waitFor(() => expect(submitMock).toHaveBeenCalledTimes(1))
    expect(await screen.findByText(en.enquiry.invalid)).toHaveAttribute('aria-live', 'polite')
    expect(screen.getByLabelText('Email')).toHaveValue('not-an-email')
  })

  it.each([
    ['Escape', () => fireEvent.keyDown(document, { key: 'Escape' })],
    ['outside interaction', dismissThroughOverlay],
  ])('keeps the pending dialog open on %s and resets only after resolved success closes', async (_name, dismiss) => {
    let resolveSubmission: (value: { ok: true }) => void = () => undefined
    submitMock.mockImplementation(() => new Promise((resolve) => { resolveSubmission = resolve }))
    renderDialog()
    await openAndFill()
    fireEvent.click(screen.getByRole('button', { name: 'Send enquiry' }))
    await waitFor(() => expect(submitMock).toHaveBeenCalledTimes(1))

    await dismiss()
    expect(screen.getByRole('dialog', { name: en.enquiry.dialogTitle })).toBeVisible()
    expect(screen.getByRole('button', { name: en.enquiry.submitting })).toBeDisabled()

    resolveSubmission({ ok: true })
    expect(await screen.findByRole('heading', { name: en.enquiry.successTitle })).toBeVisible()
    fireEvent.click(screen.getByRole('button', { name: en.enquiry.close }))
    await waitFor(() => expect(screen.getByRole('button', { name: 'Work with Ada' })).toHaveFocus())
    fireEvent.click(screen.getByRole('button', { name: 'Work with Ada' }))
    expect(screen.getByLabelText('Name')).toHaveValue('')
  })

  it.each([
    ['Escape', () => fireEvent.keyDown(document, { key: 'Escape' })],
    ['outside interaction', dismissThroughOverlay],
  ])('retains an incomplete form when closed by %s', async (_name, dismiss) => {
    renderDialog()
    fireEvent.click(screen.getByRole('button', { name: 'Work with Ada' }))
    fillIncompleteForm()

    await dismiss()
    await waitFor(() => expect(screen.getByRole('button', { name: 'Work with Ada' })).toHaveFocus())
    fireEvent.click(screen.getByRole('button', { name: 'Work with Ada' }))
    expect(screen.getByLabelText('Name')).toHaveValue('Ada Client')
    expect(screen.getByLabelText('Message')).toHaveValue('A genuine campaign enquiry.')
  })

  it('keeps the honeypot out of the textbox role set while preserving its anti-autofill attributes', () => {
    renderDialog()
    fireEvent.click(screen.getByRole('button', { name: 'Work with Ada' }))

    const honeypot = document.querySelector<HTMLInputElement>('input[name="website"]')
    expect(honeypot).toHaveAttribute('aria-hidden', 'true')
    expect(honeypot).toHaveAttribute('tabindex', '-1')
    expect(screen.getAllByRole('textbox')).toHaveLength(3)
  })

  it('derives unique field ids for separately rendered dialogs', async () => {
    const view = render(
      <>
        <EnquiryDialog type="creator_collab" targetId="a" targetName="Ada" triggerLabel="Open Ada" t={en.enquiry} />
        <EnquiryDialog type="merchant_contact" targetId="b" targetName="Baker" triggerLabel="Open Baker" t={en.enquiry} />
      </>,
    )
    fireEvent.click(screen.getByRole('button', { name: 'Open Ada' }))
    const firstId = screen.getByLabelText(en.enquiry.nameLabel).id
    fireEvent.keyDown(document, { key: 'Escape' })
    await waitFor(() => expect(screen.getByRole('button', { name: 'Open Ada' })).toHaveFocus())
    fireEvent.click(screen.getByRole('button', { name: 'Open Baker' }))
    expect(screen.getByLabelText(en.enquiry.nameLabel).id).not.toBe(firstId)
    view.unmount()
  })
})
