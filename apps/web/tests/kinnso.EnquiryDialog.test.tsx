// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import en from '@/lib/i18n/messages/en'

const { submitMock } = vi.hoisted(() => ({
  submitMock: vi.fn(),
}))

vi.mock('@/lib/enquiries/actions', () => ({
  submitEnquiryAction: submitMock,
}))

import { EnquiryDialog } from '@/components/kinnso/enquiries/EnquiryDialog'

const CREATOR_ID = '6cfdd34f-3305-4c58-9082-ec331e2afdf0'

function renderDialog() {
  return render(
    <EnquiryDialog
      type="creator_collab"
      targetId={CREATOR_ID}
      targetName="Ada Wong"
      triggerLabel="Work with Ada"
      t={en.enquiry}
    />,
  )
}

async function openAndFill() {
  fireEvent.click(screen.getByRole('button', { name: 'Work with Ada' }))
  fireEvent.change(screen.getByLabelText('Name'), { target: { value: ' Ada Client ' } })
  fireEvent.change(screen.getByLabelText('Email'), { target: { value: ' CLIENT@example.com ' } })
  fireEvent.change(screen.getByLabelText('Message'), { target: { value: ' A genuine campaign enquiry. ' } })
}

afterEach(cleanup)

beforeEach(() => {
  submitMock.mockReset()
  submitMock.mockResolvedValue({ ok: true })
})

describe('EnquiryDialog', () => {
  it('opens an accessible dialog with labelled fields and an inaccessible honeypot', () => {
    renderDialog()
    fireEvent.click(screen.getByRole('button', { name: 'Work with Ada' }))

    expect(screen.getByRole('dialog', { name: 'Send an enquiry' })).toBeVisible()
    expect(screen.getByText(en.enquiry.dialogDescription)).toBeVisible()
    expect(screen.getByText('Ada Wong')).toBeVisible()
    expect(screen.getByText(en.enquiry.creatorPurpose)).toBeVisible()
    expect(screen.getByLabelText('Name')).toBeVisible()
    expect(screen.getByLabelText('Email')).toBeVisible()
    expect(screen.getByLabelText('Message')).toBeVisible()
    expect(screen.getByRole('button', { name: 'Send enquiry' })).toBeVisible()
    expect(screen.getByRole('button', { name: 'Cancel' })).toBeVisible()
    expect(screen.queryByRole('textbox', { name: /website/i })).not.toBeInTheDocument()
    const honeypot = document.querySelector<HTMLInputElement>('input[name="website"]')
    expect(honeypot).toHaveAttribute('aria-hidden', 'true')
    expect(honeypot).toHaveAttribute('tabindex', '-1')
    expect(honeypot).toHaveAttribute('autocomplete', 'off')
  })

  it('submits normalized visible fields and an empty honeypot', async () => {
    renderDialog()
    await openAndFill()

    fireEvent.click(screen.getByRole('button', { name: 'Send enquiry' }))

    await waitFor(() => expect(submitMock).toHaveBeenCalledWith({
      type: 'creator_collab',
      targetId: CREATOR_ID,
      name: 'Ada Client',
      email: 'CLIENT@example.com',
      message: 'A genuine campaign enquiry.',
      website: '',
    }))
  })

  it('disables submission and prevents duplicate calls while pending', async () => {
    let resolveSubmission: (value: { ok: true }) => void = () => undefined
    submitMock.mockImplementation(() => new Promise((resolve) => { resolveSubmission = resolve }))
    renderDialog()
    await openAndFill()

    const submit = screen.getByRole('button', { name: 'Send enquiry' })
    fireEvent.click(submit)
    await waitFor(() => expect(submitMock).toHaveBeenCalledTimes(1))
    expect(screen.getByRole('button', { name: 'Sending enquiry…' })).toBeDisabled()
    fireEvent.click(screen.getByRole('button', { name: 'Sending enquiry…' }))
    expect(submitMock).toHaveBeenCalledTimes(1)

    resolveSubmission({ ok: true })
    expect(await screen.findByRole('heading', { name: 'Enquiry sent' })).toBeVisible()
  })

  it.each([
    ['invalid', 'Please check your name, email, and message, then try again.'],
    ['rate_limited', 'Too many enquiries from this connection. Please try again later.'],
    ['failed', 'We could not send your enquiry. Please try again.'],
  ] as const)('keeps entered fields and announces the %s result', async (error, message) => {
    submitMock.mockResolvedValue({ ok: false, error })
    renderDialog()
    await openAndFill()

    fireEvent.click(screen.getByRole('button', { name: 'Send enquiry' }))

    const feedback = await screen.findByText(message)
    expect(feedback).toHaveAttribute('aria-live', 'polite')
    expect(screen.getByLabelText('Name')).toHaveValue(' Ada Client ')
    expect(screen.getByLabelText('Email')).toHaveValue('CLIENT@example.com')
    expect(screen.getByLabelText('Message')).toHaveValue(' A genuine campaign enquiry. ')
  })

  it('cancels and closes without discarding an incomplete form, returning focus to its trigger', async () => {
    renderDialog()
    await openAndFill()

    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }))
    await waitFor(() => expect(screen.getByRole('button', { name: 'Work with Ada' })).toHaveFocus())
    fireEvent.click(screen.getByRole('button', { name: 'Work with Ada' }))
    expect(screen.getByLabelText('Name')).toHaveValue(' Ada Client ')
    expect(screen.getByLabelText('Email')).toHaveValue('CLIENT@example.com')
    expect(screen.getByLabelText('Message')).toHaveValue(' A genuine campaign enquiry. ')
  })

  it('replaces the form after success then resets only after close and reopens at the trigger', async () => {
    renderDialog()
    await openAndFill()
    fireEvent.click(screen.getByRole('button', { name: 'Send enquiry' }))

    expect(await screen.findByRole('heading', { name: 'Enquiry sent' })).toBeVisible()
    expect(screen.getAllByText(en.enquiry.successBody)).toHaveLength(1)
    expect(screen.queryByLabelText('Name')).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Send enquiry' })).not.toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Close' }))
    await waitFor(() => expect(screen.getByRole('button', { name: 'Work with Ada' })).toHaveFocus())

    fireEvent.click(screen.getByRole('button', { name: 'Work with Ada' }))
    expect(screen.getByLabelText('Name')).toHaveValue('')
    expect(screen.getByLabelText('Email')).toHaveValue('')
    expect(screen.getByLabelText('Message')).toHaveValue('')
  })
})
