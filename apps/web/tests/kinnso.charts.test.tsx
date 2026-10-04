// @vitest-environment jsdom
import { render, screen, cleanup } from '@testing-library/react'
import { afterEach, describe, expect, it } from 'vitest'
import { Sparkline } from '@/components/kinnso/Sparkline'
import { BarRow } from '@/components/kinnso/BarRow'

afterEach(cleanup)

describe('Sparkline', () => {
  it('renders an accessible img with the provided label and a polyline', () => {
    const { container } = render(<Sparkline values={[0, 10, 25, 40]} label="Points over time" />)
    const svg = screen.getByRole('img', { name: 'Points over time' })
    expect(svg).toBeTruthy()
    expect(container.querySelector('polyline')).toBeTruthy()
  })
  it('renders an empty-safe img with no polyline when there are no values', () => {
    const { container } = render(<Sparkline values={[]} label="Points over time" />)
    expect(screen.getByRole('img', { name: 'Points over time' })).toBeTruthy()
    expect(container.querySelector('polyline')).toBeNull()
  })
})

describe('BarRow', () => {
  it('renders label, value, and a bar sized to the fraction of max', () => {
    render(<BarRow label="Verified missions" value={40} max={100} />)
    expect(screen.getByText('Verified missions')).toBeTruthy()
    expect(screen.getByText('40')).toBeTruthy()
    const bar = screen.getByRole('img', { name: 'Verified missions: 40' })
    expect(bar).toBeTruthy()
  })
})
