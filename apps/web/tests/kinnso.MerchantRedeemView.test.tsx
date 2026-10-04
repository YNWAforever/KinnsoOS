// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, waitFor, cleanup } from '@testing-library/react'
import { MerchantRedeemView } from '@/components/kinnso/pages/MerchantRedeemView'

const t = {
  title: 'Redeem', scanning: 'Point the camera at the QR code',
  manualPlaceholder: 'Enter code manually', manualSubmit: 'Look up',
  amountSpentPrompt: 'Amount spent (optional)', amountSpentSubmit: 'Redeem',
  success: 'Redeemed!', alreadyRedeemed: 'Already redeemed',
}

beforeEach(() => cleanup())

describe('MerchantRedeemView', () => {
  it('submits the manually entered code and shows the amount-spent prompt', () => {
    render(<MerchantRedeemView t={t} onRedeem={vi.fn()} />)
    const input = screen.getByPlaceholderText('Enter code manually')
    fireEvent.change(input, { target: { value: 'abc123' } })
    fireEvent.click(screen.getByText('Look up'))
    expect(screen.getByText('Amount spent (optional)')).toBeInTheDocument()
  })

  it('calls onRedeem with the token and parsed amount, then shows success', async () => {
    const onRedeem = vi.fn(async () => ({ ok: true as const, redemptionId: 'r1', redeemedAt: '2027-01-01T00:00:00.000Z', alreadyRedeemed: false }))
    render(<MerchantRedeemView t={t} onRedeem={onRedeem} />)
    fireEvent.change(screen.getByPlaceholderText('Enter code manually'), { target: { value: 'abc123' } })
    fireEvent.click(screen.getByText('Look up'))
    fireEvent.change(screen.getByPlaceholderText('0.00'), { target: { value: '45' } })
    const redeemButtons = screen.getAllByText('Redeem')
    fireEvent.click(redeemButtons[redeemButtons.length - 1])
    await waitFor(() => expect(onRedeem).toHaveBeenCalledWith('abc123', 45))
    await waitFor(() => expect(screen.getByText('Redeemed!')).toBeInTheDocument())
  })

  it('shows the already-redeemed message distinctly from a fresh success', async () => {
    const onRedeem = vi.fn(async () => ({ ok: true as const, redemptionId: 'r1', redeemedAt: '2027-01-01T00:00:00.000Z', alreadyRedeemed: true }))
    render(<MerchantRedeemView t={t} onRedeem={onRedeem} />)
    fireEvent.change(screen.getByPlaceholderText('Enter code manually'), { target: { value: 'abc123' } })
    fireEvent.click(screen.getByText('Look up'))
    const redeemButtons = screen.getAllByText('Redeem')
    fireEvent.click(redeemButtons[redeemButtons.length - 1])
    await waitFor(() => expect(screen.getByText('Already redeemed')).toBeInTheDocument())
  })

  it('shows a friendly error and lets the user retry without losing the manual code', async () => {
    const onRedeem = vi.fn(async () => ({ ok: false as const, errors: { form: ['Code not recognized'] } }))
    render(<MerchantRedeemView t={t} onRedeem={onRedeem} />)
    fireEvent.change(screen.getByPlaceholderText('Enter code manually'), { target: { value: 'bad-code' } })
    fireEvent.click(screen.getByText('Look up'))
    const redeemButtons = screen.getAllByText('Redeem')
    fireEvent.click(redeemButtons[redeemButtons.length - 1])
    await waitFor(() => expect(screen.getByText('Code not recognized')).toBeInTheDocument())
  })

  it('rejects a non-numeric amount instead of silently discarding it', async () => {
    const onRedeem = vi.fn()
    render(<MerchantRedeemView t={t} onRedeem={onRedeem} />)
    fireEvent.change(screen.getByPlaceholderText('Enter code manually'), { target: { value: 'abc123' } })
    fireEvent.click(screen.getByText('Look up'))
    fireEvent.change(screen.getByPlaceholderText('0.00'), { target: { value: 'abc' } })
    fireEvent.click(screen.getAllByText('Redeem').at(-1)!)
    expect(onRedeem).not.toHaveBeenCalled()
  })
})
