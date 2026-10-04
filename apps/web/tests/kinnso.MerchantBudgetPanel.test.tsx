// @vitest-environment jsdom
import { cleanup, render, screen, fireEvent, waitFor } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import en from '@/lib/i18n/messages/en'
import { MerchantBudgetPanel } from '@/components/kinnso/admin/merchants/MerchantBudgetPanel'

afterEach(cleanup)
const t = en.merchantsOps

describe('MerchantBudgetPanel', () => {
  it('shows the balance to two decimal places and the enforcement state', () => {
    render(<MerchantBudgetPanel t={t} locale="en" merchantId="m1" budget={{ balance: 100.5, currency: 'HKD', enforced: true }} credit={vi.fn()} enforce={vi.fn()} />)
    expect(screen.getByText(/HKD 100\.50/)).toBeTruthy()
    expect(screen.getByText(new RegExp(t.budgetEnforced))).toBeTruthy()
  })

  it('submits a credit with amount and reason', async () => {
    const credit = vi.fn().mockResolvedValue({ ok: true, id: 'm1' })
    render(<MerchantBudgetPanel t={t} locale="en" merchantId="m1" budget={null} credit={credit} enforce={vi.fn()} />)
    fireEvent.change(screen.getByLabelText(t.budgetCreditLabel), { target: { value: '250' } })
    fireEvent.change(screen.getByLabelText(t.budgetReasonPlaceholder), { target: { value: 'Pilot funding' } })
    fireEvent.click(screen.getByRole('button', { name: t.budgetCreditSubmit }))
    await waitFor(() => expect(credit).toHaveBeenCalledWith('en', 'm1', 250, 'Pilot funding'))
  })

  it('disables the enforcement toggle when no budget row exists', () => {
    render(<MerchantBudgetPanel t={t} locale="en" merchantId="m1" budget={null} credit={vi.fn()} enforce={vi.fn()} />)
    expect(screen.getByRole('button', { name: t.budgetEnforceOn })).toHaveProperty('disabled', true)
  })

  it('surfaces a server error and keeps the form usable', async () => {
    const credit = vi.fn().mockResolvedValue({ ok: false, errors: { form: ['That adjustment would take the balance below zero.'] } })
    render(<MerchantBudgetPanel t={t} locale="en" merchantId="m1" budget={{ balance: 10, currency: 'HKD', enforced: false }} credit={credit} enforce={vi.fn()} />)
    fireEvent.change(screen.getByLabelText(t.budgetCreditLabel), { target: { value: '-500' } })
    fireEvent.change(screen.getByLabelText(t.budgetReasonPlaceholder), { target: { value: 'clawback' } })
    fireEvent.click(screen.getByRole('button', { name: t.budgetCreditSubmit }))
    expect(await screen.findByText('That adjustment would take the balance below zero.')).toBeTruthy()
  })
})
