// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { MissionPostWizard } from '@/components/kinnso/pages/MissionPostWizard'
import en from '@/lib/i18n/messages/en'

afterEach(cleanup)

describe('MissionPostWizard', () => {
  it('renders with Market Passport ticket chrome', () => {
    render(<MissionPostWizard locale="en" t={en.missions} onSubmit={vi.fn()} />)
    expect(document.querySelector('.k-ticket')).toBeTruthy()
  })

  it('shows coupon fields for coupon affiliate missions', () => {
    render(<MissionPostWizard locale="en" t={en.missions} onSubmit={vi.fn()} />)
    fireEvent.click(screen.getByRole('radio', { name: en.missions.typeCoupon }))
    expect(screen.getByLabelText(en.missions.couponCode)).toBeTruthy()
    expect(screen.getByLabelText(en.missions.creatorCommissionRate)).toBeTruthy()
  })

  it('shows paid fee and milestone fields for paid missions', () => {
    render(<MissionPostWizard locale="en" t={en.missions} onSubmit={vi.fn()} />)
    fireEvent.click(screen.getByRole('radio', { name: en.missions.typePaid }))
    expect(screen.getByLabelText(en.missions.paidFeeAmount)).toBeTruthy()
    expect(screen.getByLabelText(en.missions.milestoneTitle)).toBeTruthy()
  })

  it('shows per-receipt amount and cap fields for receipt_cashback missions, and hides coupon/milestone fields', () => {
    render(<MissionPostWizard locale="en" t={en.missions} onSubmit={vi.fn()} />)
    fireEvent.click(screen.getByRole('radio', { name: en.missions.typeReceiptCashback }))
    expect(screen.getByLabelText(en.missions.receiptCashbackAmount)).toBeTruthy()
    expect(screen.getByLabelText(en.missions.paidFeeCurrency)).toBeTruthy()
    expect(screen.getByLabelText(en.missions.maxReceiptsPerCreator)).toBeTruthy()
    expect(screen.queryByLabelText(en.missions.couponCode)).toBeNull()
    expect(screen.queryByLabelText(en.missions.creatorCommissionRate)).toBeNull()
    expect(screen.queryByLabelText(en.missions.milestoneTitle)).toBeNull()
  })

  it('submits a valid receipt_cashback draft payload', () => {
    const onSubmit = vi.fn()
    render(<MissionPostWizard locale="en" t={en.missions} onSubmit={onSubmit} />)
    fireEvent.click(screen.getByRole('radio', { name: en.missions.typeReceiptCashback }))
    fireEvent.change(screen.getByLabelText(en.missions.title), { target: { value: 'Cafe receipt cashback' } })
    fireEvent.change(screen.getByLabelText(en.missions.summary), { target: { value: 'Get cashback for every receipt.' } })
    fireEvent.change(screen.getByLabelText(en.missions.receiptCashbackAmount), { target: { value: '50' } })
    fireEvent.change(screen.getByLabelText(en.missions.maxReceiptsPerCreator), { target: { value: '3' } })
    fireEvent.click(screen.getByRole('button', { name: en.missions.saveDraft }))
    expect(onSubmit).toHaveBeenCalledWith(
      expect.objectContaining({
        missionType: 'receipt_cashback',
        paidFeeAmount: 50,
        paidFeeCurrency: 'HKD',
        maxReceiptsPerCreator: 3,
        milestones: [],
      }),
      { publish: false },
    )
  })

  it('blocks a receipt_cashback draft with no per-receipt amount', () => {
    const onSubmit = vi.fn()
    render(<MissionPostWizard locale="en" t={en.missions} onSubmit={onSubmit} />)
    fireEvent.click(screen.getByRole('radio', { name: en.missions.typeReceiptCashback }))
    fireEvent.change(screen.getByLabelText(en.missions.title), { target: { value: 'Cafe receipt cashback' } })
    fireEvent.change(screen.getByLabelText(en.missions.summary), { target: { value: 'Get cashback for every receipt.' } })
    fireEvent.click(screen.getByRole('button', { name: en.missions.saveDraft }))
    expect(screen.getByRole('alert')).toHaveTextContent(en.missions.validationError)
    expect(onSubmit).not.toHaveBeenCalled()
  })

  it('submits a draft payload', () => {
    const onSubmit = vi.fn()
    render(<MissionPostWizard locale="en" t={en.missions} onSubmit={onSubmit} />)
    fireEvent.change(screen.getByLabelText(en.missions.title), { target: { value: 'Test mission' } })
    fireEvent.change(screen.getByLabelText(en.missions.summary), { target: { value: 'Mission summary' } })
    fireEvent.change(screen.getByLabelText(en.missions.couponCode), { target: { value: 'TEST10' } })
    fireEvent.change(screen.getByLabelText(en.missions.couponUrl), { target: { value: 'https://example.com/test' } })
    fireEvent.click(screen.getByRole('button', { name: en.missions.saveDraft }))
    expect(onSubmit).toHaveBeenCalledWith(expect.objectContaining({ title: 'Test mission' }), { publish: false })
  })

  it('blocks invalid draft payloads', () => {
    const onSubmit = vi.fn()
    render(<MissionPostWizard locale="en" t={en.missions} onSubmit={onSubmit} />)
    fireEvent.change(screen.getByLabelText(en.missions.title), { target: { value: 'Test mission' } })
    fireEvent.change(screen.getByLabelText(en.missions.summary), { target: { value: 'Mission summary' } })
    fireEvent.click(screen.getByRole('button', { name: en.missions.saveDraft }))
    expect(screen.getByRole('alert')).toHaveTextContent(en.missions.validationError)
    expect(onSubmit).not.toHaveBeenCalled()
  })

  it('shows server action errors', async () => {
    const onSubmit = vi.fn(async () => ({ ok: false, errors: { form: ['Merchant profile is required'] } }))
    render(<MissionPostWizard locale="en" t={en.missions} onSubmit={onSubmit} />)
    fireEvent.change(screen.getByLabelText(en.missions.title), { target: { value: 'Test mission' } })
    fireEvent.change(screen.getByLabelText(en.missions.summary), { target: { value: 'Mission summary' } })
    fireEvent.change(screen.getByLabelText(en.missions.couponCode), { target: { value: 'TEST10' } })
    fireEvent.change(screen.getByLabelText(en.missions.couponUrl), { target: { value: 'https://example.com/test' } })
    fireEvent.click(screen.getByRole('button', { name: en.missions.saveDraft }))

    await waitFor(() => expect(screen.getByRole('alert')).toHaveTextContent('Merchant profile is required'))
  })

  it('prevents duplicate submissions while pending', async () => {
    let resolveSubmit: () => void = () => {}
    const onSubmit = vi.fn(
      () =>
        new Promise<{ ok: false; errors: { form: string[] } }>((resolve) => {
          resolveSubmit = () => resolve({ ok: false, errors: { form: ['Retry after fixing the issue'] } })
        }),
    )
    render(<MissionPostWizard locale="en" t={en.missions} onSubmit={onSubmit} />)
    fireEvent.change(screen.getByLabelText(en.missions.title), { target: { value: 'Test mission' } })
    fireEvent.change(screen.getByLabelText(en.missions.summary), { target: { value: 'Mission summary' } })
    fireEvent.change(screen.getByLabelText(en.missions.couponCode), { target: { value: 'TEST10' } })
    fireEvent.change(screen.getByLabelText(en.missions.couponUrl), { target: { value: 'https://example.com/test' } })

    const saveDraft = screen.getByRole('button', { name: en.missions.saveDraft })
    fireEvent.click(saveDraft)
    fireEvent.click(saveDraft)

    await waitFor(() => expect(saveDraft).toBeDisabled())
    expect(onSubmit).toHaveBeenCalledTimes(1)

    resolveSubmit()
    await waitFor(() => expect(saveDraft).not.toBeDisabled())
  })

  it('shows a success panel after a successful create', async () => {
    const onSubmit = vi.fn(async () => ({ ok: true }))
    render(<MissionPostWizard locale="en" t={en.missions} onSubmit={onSubmit} />)
    fireEvent.change(screen.getByLabelText(en.missions.title), { target: { value: 'Test mission' } })
    fireEvent.change(screen.getByLabelText(en.missions.summary), { target: { value: 'Mission summary' } })
    fireEvent.change(screen.getByLabelText(en.missions.couponCode), { target: { value: 'TEST10' } })
    fireEvent.change(screen.getByLabelText(en.missions.couponUrl), { target: { value: 'https://example.com/test' } })

    fireEvent.click(screen.getByRole('button', { name: en.missions.saveDraft }))

    expect(await screen.findByText(en.missions.postSuccessTitle)).toBeTruthy()
    expect(screen.queryByRole('button', { name: en.missions.saveDraft })).toBeNull()
    expect(onSubmit).toHaveBeenCalledTimes(1)
  })

  it('links the success panel to the new mission and the queue', async () => {
    const onSubmit = vi.fn(async () => ({ ok: true, missionId: 'm1' }))
    render(<MissionPostWizard locale="en" t={en.missions} onSubmit={onSubmit} />)
    fireEvent.change(screen.getByLabelText(en.missions.title), { target: { value: 'Test mission' } })
    fireEvent.change(screen.getByLabelText(en.missions.summary), { target: { value: 'Mission summary' } })
    fireEvent.change(screen.getByLabelText(en.missions.couponCode), { target: { value: 'TEST10' } })
    fireEvent.change(screen.getByLabelText(en.missions.couponUrl), { target: { value: 'https://example.com/test' } })

    fireEvent.click(screen.getByRole('button', { name: en.missions.publish }))

    expect((await screen.findByRole('link', { name: en.missions.viewMission })).getAttribute('href')).toBe('/en/merchants/dashboard/missions/m1')
    expect(screen.getByRole('link', { name: en.missions.backToQueue }).getAttribute('href')).toBe('/en/merchants/dashboard/missions')
  })

  it('shows the brief details section for every mission type', () => {
    render(<MissionPostWizard locale="en" t={en.missions} onSubmit={vi.fn()} />)
    expect(screen.getByLabelText(en.missions.deliverablesLabel)).toBeTruthy()
    expect(screen.getByLabelText(en.missions.requirementsLabel)).toBeTruthy()
    expect(screen.getByLabelText(en.missions.dosLabel)).toBeTruthy()
    expect(screen.getByLabelText(en.missions.dontsLabel)).toBeTruthy()
    expect(screen.getByLabelText(en.missions.keyMessagesLabel)).toBeTruthy()
    expect(screen.getByLabelText(en.missions.referenceLinksLabel)).toBeTruthy()
    expect(screen.getByLabelText(en.missions.effortLabel)).toBeTruthy()

    fireEvent.click(screen.getByRole('radio', { name: en.missions.typeReceiptCashback }))
    expect(screen.getByLabelText(en.missions.deliverablesLabel)).toBeTruthy()
  })

  it('splits one-item-per-line brief textareas into arrays on submit, dropping blank lines', () => {
    const onSubmit = vi.fn()
    render(<MissionPostWizard locale="en" t={en.missions} onSubmit={onSubmit} />)
    fireEvent.click(screen.getByRole('radio', { name: en.missions.typeCoupon }))
    fireEvent.change(screen.getByLabelText(en.missions.title), { target: { value: 'Ramen coupon' } })
    fireEvent.change(screen.getByLabelText(en.missions.summary), { target: { value: 'Promote the ramen coupon.' } })
    fireEvent.change(screen.getByLabelText(en.missions.couponCode), { target: { value: 'RAMEN10' } })
    fireEvent.change(screen.getByLabelText(en.missions.couponUrl), { target: { value: 'https://example.com' } })
    fireEvent.change(
      screen.getByLabelText(en.missions.deliverablesLabel),
      { target: { value: 'Instagram Reel\n\nBlog post\n' } },
    )
    fireEvent.change(
      screen.getByLabelText(en.missions.referenceLinksLabel),
      { target: { value: 'https://merchant.test/brand-guide' } },
    )
    fireEvent.change(screen.getByLabelText(en.missions.effortLabel), { target: { value: 'medium' } })
    fireEvent.click(screen.getByRole('button', { name: en.missions.saveDraft }))
    expect(onSubmit).toHaveBeenCalledWith(
      expect.objectContaining({
        deliverables: ['Instagram Reel', 'Blog post'],
        referenceLinks: ['https://merchant.test/brand-guide'],
        effort: 'medium',
      }),
      { publish: false },
    )
  })

  it('defaults brief richness fields to empty arrays and a null effort when left blank', () => {
    const onSubmit = vi.fn()
    render(<MissionPostWizard locale="en" t={en.missions} onSubmit={onSubmit} />)
    fireEvent.click(screen.getByRole('radio', { name: en.missions.typeCoupon }))
    fireEvent.change(screen.getByLabelText(en.missions.title), { target: { value: 'Ramen coupon' } })
    fireEvent.change(screen.getByLabelText(en.missions.summary), { target: { value: 'Promote the ramen coupon.' } })
    fireEvent.change(screen.getByLabelText(en.missions.couponCode), { target: { value: 'RAMEN10' } })
    fireEvent.change(screen.getByLabelText(en.missions.couponUrl), { target: { value: 'https://example.com' } })
    fireEvent.click(screen.getByRole('button', { name: en.missions.saveDraft }))
    expect(onSubmit).toHaveBeenCalledWith(
      expect.objectContaining({
        deliverables: [], requirements: [], dos: [], donts: [], keyMessages: [], referenceLinks: [],
        effort: null,
      }),
      { publish: false },
    )
  })

  it('blocks submit with an invalid reference link', () => {
    const onSubmit = vi.fn()
    render(<MissionPostWizard locale="en" t={en.missions} onSubmit={onSubmit} />)
    fireEvent.click(screen.getByRole('radio', { name: en.missions.typeCoupon }))
    fireEvent.change(screen.getByLabelText(en.missions.title), { target: { value: 'Ramen coupon' } })
    fireEvent.change(screen.getByLabelText(en.missions.summary), { target: { value: 'Promote the ramen coupon.' } })
    fireEvent.change(screen.getByLabelText(en.missions.couponCode), { target: { value: 'RAMEN10' } })
    fireEvent.change(screen.getByLabelText(en.missions.couponUrl), { target: { value: 'https://example.com' } })
    fireEvent.change(screen.getByLabelText(en.missions.referenceLinksLabel), { target: { value: 'not a url' } })
    fireEvent.click(screen.getByRole('button', { name: en.missions.saveDraft }))
    expect(screen.getByRole('alert')).toHaveTextContent(en.missions.validationError)
    expect(onSubmit).not.toHaveBeenCalled()
  })
})

describe('MissionPostWizard minimum-tier selector', () => {
  it('renders all four minimum-tier options', () => {
    render(<MissionPostWizard locale="en" t={en.missions} onSubmit={vi.fn()} />)
    expect(screen.getByText(en.missions.minTierOpen)).toBeTruthy()
    expect(screen.getByText(en.missions.minTierRising)).toBeTruthy()
    expect(screen.getByText(en.missions.minTierPro)).toBeTruthy()
    expect(screen.getByText(en.missions.minTierElite)).toBeTruthy()
  })

  it('selects Pro+ and checks the corresponding radio', () => {
    render(<MissionPostWizard locale="en" t={en.missions} onSubmit={vi.fn()} />)
    const proRadio = document.querySelector('input[name="minTier"][value="pro"]') as HTMLInputElement
    expect(proRadio).toBeTruthy()
    expect(proRadio.checked).toBe(false)
    fireEvent.click(proRadio)
    expect(proRadio.checked).toBe(true)
  })
})
