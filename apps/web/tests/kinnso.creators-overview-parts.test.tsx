// @vitest-environment jsdom
import { cleanup, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it } from 'vitest'
import en from '@/lib/i18n/messages/en'
import { KpiCard } from '@/components/kinnso/admin/KpiCard'
import { TrendChart } from '@/components/kinnso/admin/TrendChart'
import { Leaderboard } from '@/components/kinnso/admin/creators/Leaderboard'

afterEach(cleanup)

describe('KpiCard', () => {
  it('renders label, value, and a positive delta sign', () => {
    render(<KpiCard label="New this period" value={3} delta={2} />)
    expect(screen.getByText('New this period')).toBeTruthy()
    expect(screen.getByText('3')).toBeTruthy()
    expect(screen.getByText('+2')).toBeTruthy()
  })
  it('renders without a delta when none is given', () => {
    render(<KpiCard label="Total" value={12} />)
    expect(screen.getByText('12')).toBeTruthy()
  })
})

describe('TrendChart', () => {
  it('renders one bar per data point with heights scaled to the max', () => {
    render(<TrendChart points={[{ label: 'a', value: 1 }, { label: 'b', value: 4 }]} emptyText="none" />)
    const bars = document.querySelectorAll('[data-testid="trend-bar"]')
    expect(bars.length).toBe(2)
    // tallest bar reaches 100% height, the other is a quarter
    expect((bars[1] as HTMLElement).style.height).toBe('100%')
    expect((bars[0] as HTMLElement).style.height).toBe('25%')
  })
  it('renders the empty text when there are no points', () => {
    render(<TrendChart points={[]} emptyText="none" />)
    expect(screen.getByText('none')).toBeTruthy()
  })
  it('names the chart for screen readers via ariaLabel', () => {
    render(<TrendChart points={[{ label: 'a', value: 1 }]} emptyText="none" ariaLabel="Signups" />)
    expect(screen.getByRole('img', { name: 'Signups' })).toBeTruthy()
  })
})

describe('Leaderboard', () => {
  it('renders rows in the given order with rank, name, and points', () => {
    render(
      <Leaderboard
        t={en.creators}
        rows={[
          { creatorId: 'c1', displayName: 'Mia', points: 320, tier: 'pro' },
          { creatorId: 'c2', displayName: null, points: 100, tier: 'seed' },
        ]}
      />,
    )
    expect(screen.getByText('Mia')).toBeTruthy()
    expect(screen.getByText('320')).toBeTruthy()
    expect(screen.getByText(en.creators.tierPro)).toBeTruthy()
  })
  it('renders the empty state when there are no rows', () => {
    render(<Leaderboard t={en.creators} rows={[]} />)
    expect(screen.getByText(en.creators.leaderboardEmpty)).toBeTruthy()
  })
})
