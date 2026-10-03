// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { ExploreControls, type ExploreControlsProps } from '@/components/kinnso/explore/ExploreControls'
import en from '@/lib/i18n/messages/en'

const destinations = [{ slug: 'tokyo', name: 'Tokyo', matchTerms: ['?\u66f9\u6f2a'], guideCount: 2 }]

afterEach(cleanup)

function renderControls(overrides: Partial<ExploreControlsProps> = {}) {
  const props: ExploreControlsProps = {
    t: en.explore,
    destinations,
    destination: null,
    searchValue: '',
    sort: 'newest',
    total: 2,
    allowMostSaved: true,
    onDestinationChange: vi.fn(),
    onSearchChange: vi.fn(),
    onSortChange: vi.fn(),
    children: <div data-testid="results">Results</div>,
    ...overrides,
  }
  render(<ExploreControls {...props} />)
  return props
}

describe('ExploreControls', () => {
  it('renders labelled controls, result content, and Most saved when verified', () => {
    renderControls()
    expect(screen.getByRole('searchbox', { name: en.explore.searchLabel })).toBeVisible()
    expect(screen.getByRole('group', { name: en.explore.destinationFilterLabel })).toBeVisible()
    expect(screen.getByRole('radio', { name: en.explore.allDestinations })).toBeChecked()
    expect(screen.getByRole('option', { name: en.explore.mostSaved })).toBeVisible()
    expect(screen.getByRole('button', { name: new RegExp(en.explore.filters) })).toBeVisible()
    expect(screen.getByTestId('results')).toBeVisible()
  })

  it('hides Most saved when every verified count is zero', () => {
    renderControls({ allowMostSaved: false })
    expect(screen.queryByRole('option', { name: en.explore.mostSaved })).not.toBeInTheDocument()
  })

  it('hides destination controls when canonical inventory is unavailable', () => {
    renderControls({ destinations: [] })
    expect(screen.queryByRole('group', { name: en.explore.destinationFilterLabel })).not.toBeInTheDocument()
    expect(screen.getByTestId('results')).toBeVisible()
  })

  it('emits destination, search, and sort changes', () => {
    const props = renderControls()
    fireEvent.click(screen.getByRole('radio', { name: 'Tokyo' }))
    fireEvent.change(screen.getByRole('searchbox', { name: en.explore.searchLabel }), {
      target: { value: 'ramen' },
    })
    fireEvent.change(screen.getByLabelText(en.explore.sortLabel), {
      target: { value: 'most-saved' },
    })
    expect(props.onDestinationChange).toHaveBeenCalledWith('tokyo')
    expect(props.onSearchChange).toHaveBeenCalledWith('ramen')
    expect(props.onSortChange).toHaveBeenCalledWith('most-saved')
  })

  it('uses distinct radio groups for desktop and mobile destination controls', () => {
    renderControls()
    fireEvent.click(screen.getByRole('button', { name: new RegExp(en.explore.filters) }))
    const tokyoRadios = Array.from(document.querySelectorAll<HTMLInputElement>('input[type="radio"][value="tokyo"]'))
    expect(tokyoRadios).toHaveLength(2)
    expect(new Set(tokyoRadios.map((radio) => radio.name)).size).toBe(2)
  })
  it('opens a labelled bottom sheet and closes it with Escape', async () => {
    renderControls()
    const trigger = screen.getByRole('button', { name: new RegExp(en.explore.filters) })
    trigger.focus()
    fireEvent.click(trigger)
    expect(screen.getByRole('dialog', { name: en.explore.filters })).toBeVisible()
    expect(screen.getByText(en.explore.filtersDescription)).toBeVisible()
    fireEvent.keyDown(document, { key: 'Escape' })
    expect(screen.queryByRole('dialog', { name: en.explore.filters })).not.toBeInTheDocument()
    await waitFor(() => expect(trigger).toHaveFocus())
  })
})
