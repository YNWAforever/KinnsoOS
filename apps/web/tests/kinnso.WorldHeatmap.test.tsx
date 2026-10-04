// @vitest-environment jsdom
import { describe, it, expect, vi, afterEach } from 'vitest'
import { render, screen, fireEvent, cleanup } from '@testing-library/react'
import type { CreatorLocation } from '@/lib/creator-mock'

afterEach(cleanup)

// Stub react-simple-maps: ComposableMap/Geographies render nothing geo-related;
// Marker renders a clickable wrapper carrying its city label so we can assert.
vi.mock('react-simple-maps', () => ({
  ComposableMap: ({ children }: { children: React.ReactNode }) => <svg>{children}</svg>,
  Geographies: ({ children }: { children: (a: { geographies: unknown[] }) => React.ReactNode }) =>
    <>{children({ geographies: [] })}</>,
  Geography: () => null,
  Marker: ({ children, onClick }: { children: React.ReactNode; onClick?: () => void }) => (
    <g data-testid="marker" onClick={onClick}>{children}</g>
  ),
}))

import WorldHeatmap from '@/components/kinnso/WorldHeatmap'

const locations: CreatorLocation[] = [
  { creatorHandle: 'maywanders', city: 'Tokyo', country: 'JP', countryName: 'Japan', flag: '🇯🇵', lat: 35.6762, lon: 139.6503, postCount: 17, firstVisited: '2024-03-12', lastVisited: '2026-06-08' },
  { creatorHandle: 'maywanders', city: 'Kyoto', country: 'JP', countryName: 'Japan', flag: '🇯🇵', lat: 35.0116, lon: 135.7681, postCount: 11, firstVisited: '2024-03-12', lastVisited: '2026-06-08' },
]

describe('WorldHeatmap', () => {
  it('renders one marker per location', () => {
    render(<WorldHeatmap locations={locations} />)
    expect(screen.getAllByTestId('marker')).toHaveLength(2)
  })

  it('calls onCityClick with the location when a marker is clicked', () => {
    const onCityClick = vi.fn()
    render(<WorldHeatmap locations={locations} onCityClick={onCityClick} />)
    fireEvent.click(screen.getAllByTestId('marker')[0])
    expect(onCityClick).toHaveBeenCalledWith(locations[0])
  })

  it('does not fire onCityClick when interactive=false', () => {
    const onCityClick = vi.fn()
    render(<WorldHeatmap locations={locations} interactive={false} onCityClick={onCityClick} />)
    fireEvent.click(screen.getAllByTestId('marker')[0])
    expect(onCityClick).not.toHaveBeenCalled()
  })
})
