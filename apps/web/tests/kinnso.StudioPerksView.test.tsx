// @vitest-environment jsdom
import { cleanup, render, screen, fireEvent, waitFor } from '@testing-library/react'
import { afterEach, describe, expect, it } from 'vitest'
import { StudioPerksView } from '@/components/kinnso/pages/StudioPerksView'
import en from '@/lib/i18n/messages/en'
import type { PerkCard } from '@/lib/perks/list'

afterEach(cleanup)

const base: PerkCard = {
  id: 'p1', slug: 'k', partnerName: 'Klook', title: 'Klook Deal', summary: 'Save',
  category: 'Travel', discountLabel: '10% off', minTier: 'pro', redemptionType: 'code', state: 'redeemable',
}
const redeem = async () => ({ ok: true as const, redemptionType: 'code' as const, value: 'CODE10' })

describe('StudioPerksView', () => {
  it('shows the empty state', () => {
    render(<StudioPerksView locale="en" t={en.perks} cards={[]} onRedeem={redeem} />)
    expect(screen.getByText(en.perks.catalog.empty)).toBeTruthy()
  })
  it('locked card shows the requirement and the unlock CTA, no redeem button', () => {
    render(<StudioPerksView locale="en" t={en.perks} cards={[{ ...base, state: 'locked' }]} onRedeem={redeem} />)
    expect(screen.getByText(en.perks.catalog.unlockCta)).toBeTruthy()
    expect(screen.queryByText(en.perks.catalog.redeem)).toBeNull()
  })
  it('redeemable card reveals the value after Redeem', async () => {
    render(<StudioPerksView locale="en" t={en.perks} cards={[base]} onRedeem={redeem} />)
    fireEvent.click(screen.getByText(en.perks.catalog.redeem))
    await waitFor(() => expect(screen.getByText('CODE10')).toBeTruthy())
  })
})
