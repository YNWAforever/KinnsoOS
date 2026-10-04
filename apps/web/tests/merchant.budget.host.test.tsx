// @vitest-environment jsdom
import { cleanup, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { MerchantBudget } from '@/lib/merchants/budget-queries'

const { merchantPageGateMock, budgetMock } = vi.hoisted(() => ({
  merchantPageGateMock: vi.fn(async () => ({ user: { id: 'u1' }, merchantId: 'merchant-1' })),
  budgetMock: vi.fn(async (): Promise<MerchantBudget | null> => ({
    balance: 250.5, currency: 'HKD', enforced: true,
    ledger: [{ id: 't1', kind: 'topup', amount: 250.5, balanceAfter: 250.5, reason: 'Pilot funding', createdAt: '2026-08-20T00:00:00Z' }],
  })),
}))

vi.mock('next/navigation', () => ({
  notFound: () => { throw new Error('NEXT_NOT_FOUND') },
  redirect: (p: string) => { throw new Error(`NEXT_REDIRECT:${p}`) },
}))
vi.mock('@/lib/admin/guard', () => ({ requireMerchantPage: merchantPageGateMock }))
vi.mock('@/lib/supabase/server', () => ({ createSupabaseServerClient: async () => ({}) }))
vi.mock('@/lib/merchants/budget-queries', () => ({ getMerchantBudget: budgetMock }))

import MerchantBudgetPage from '@/app/[locale]/merchants/dashboard/budget/page'

beforeEach(() => {
  merchantPageGateMock.mockReset()
  merchantPageGateMock.mockResolvedValue({ user: { id: 'u1' }, merchantId: 'merchant-1' })
  budgetMock.mockClear()
})
afterEach(cleanup)

describe('/[locale]/merchants/dashboard/budget host', () => {
  it('renders the balance and ledger for the merchant', async () => {
    const ui = await MerchantBudgetPage({ params: Promise.resolve({ locale: 'en' }) })
    render(ui)
    expect(budgetMock).toHaveBeenCalledWith(expect.anything(), 'merchant-1')
    // 'HKD 250.50' appears twice by design: the balance headline and the ledger row's
    // balance-after — and the non-round fixture locks in the .toFixed(2) formatting.
    expect(screen.getAllByText('HKD 250.50').length).toBe(2)
    expect(screen.getByText('Pilot funding')).toBeTruthy()
    expect(screen.getByText('2026-08-20')).toBeTruthy()
  })

  it('shows the no-budget state', async () => {
    budgetMock.mockResolvedValueOnce(null)
    const ui = await MerchantBudgetPage({ params: Promise.resolve({ locale: 'en' }) })
    render(ui)
    expect(screen.getByText('No budget set up yet — contact KINNSO ops to fund missions.')).toBeTruthy()
  })

  it('notFounds a non-merchant', async () => {
    merchantPageGateMock.mockRejectedValueOnce(new Error('NEXT_NOT_FOUND'))
    await expect(MerchantBudgetPage({ params: Promise.resolve({ locale: 'en' }) })).rejects.toThrow('NEXT_NOT_FOUND')
  })

  it('redirects an anonymous viewer to sign-in', async () => {
    merchantPageGateMock.mockRejectedValueOnce(new Error('NEXT_REDIRECT:/en/sign-in'))
    await expect(MerchantBudgetPage({ params: Promise.resolve({ locale: 'en' }) })).rejects.toThrow('NEXT_REDIRECT:/en/sign-in')
  })
})
