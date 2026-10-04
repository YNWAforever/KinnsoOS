// @vitest-environment jsdom
import { describe, it, expect, afterEach } from 'vitest'
import { render, screen, cleanup } from '@testing-library/react'
import ContentMixDonut from '@/components/kinnso/ContentMixDonut'

afterEach(cleanup)

const data = [
  { tag: 'Coffee', pct: 38, color: '#F26A1F' },
  { tag: 'Food', pct: 20, color: '#F4A52A' },
]

describe('ContentMixDonut', () => {
  it('renders a legend row per slice with tag and percentage', () => {
    render(<ContentMixDonut data={data} />)
    expect(screen.getByText('Coffee')).toBeTruthy()
    expect(screen.getByText('Food')).toBeTruthy()
    expect(screen.getByText('38%')).toBeTruthy()
    expect(screen.getByText('20%')).toBeTruthy()
  })

  it('hides the legend when showLegend is false', () => {
    render(<ContentMixDonut data={data} showLegend={false} />)
    expect(screen.queryByText('Coffee')).toBeNull()
  })
})
