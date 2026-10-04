// @vitest-environment jsdom
import { cleanup, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it } from 'vitest'
import en from '@/lib/i18n/messages/en'
import { TierProgressCard } from '@/components/kinnso/TierProgressCard'
import { progressToNext } from '@/lib/contribution/tiers'

afterEach(cleanup)

describe('TierProgressCard', () => {
  it('renders the tier badge, points, and progress to next tier', () => {
    render(<TierProgressCard locale="en" t={en.tier} contribution={progressToNext(80)} />)
    expect(screen.getByText('Your tier')).toBeTruthy()
    expect(screen.getByText('Rising')).toBeTruthy() // tierMeta label for 'rising'
    expect(screen.getByText('70 pts to Pro')).toBeTruthy()
    expect(screen.getByText('Complete a verified mission')).toBeTruthy()
    const link = screen.getByRole('link', { name: /Tier details/i })
    expect(link.getAttribute('href')).toBe('/en/studio/tier')
  })

  it('shows the maxed message at elite with no next tier', () => {
    render(<TierProgressCard locale="en" t={en.tier} contribution={progressToNext(450)} />)
    expect(screen.getByText('Elite')).toBeTruthy()
    expect(screen.getByText('Top tier reached')).toBeTruthy()
  })
})
