// apps/web/tests/kinnso.guide-card.test.tsx
// @vitest-environment jsdom
import { render, screen, cleanup, fireEvent } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import GuideCard from '@/components/kinnso/GuideCard'

afterEach(cleanup)

const guide = { slug: 'kyoto-tea', title: 'Kyoto Tea Houses', cover: 'https://picsum.photos/seed/kyoto/800/600', city: 'Kyoto', saves: 5, creatorHandle: 'teafan' }

describe('GuideCard', () => {
  it('renders honest missing media and no static save proof', () => {
    const { container } = render(<GuideCard g={guide} locale="en" />)
    expect(screen.queryByRole('button')).toBeNull()
    expect(screen.queryByText('5')).toBeNull()
    expect(container.querySelector('[data-media-placeholder="true"]')).toBeTruthy()
    expect(container.innerHTML).not.toContain('picsum.photos')
  })

  it('renders an interactive toggle button when isSaved/onSaveToggle are both supplied, and never navigates the card link on click', () => {
    const onSaveToggle = vi.fn()
    const { container } = render(<GuideCard g={guide} locale="en" isSaved={true} onSaveToggle={onSaveToggle} />)
    const button = screen.getByRole('button')
    const link = screen.getByRole('link')
    expect(button.closest('a')).toBeNull()
    expect(button.parentElement).toBe(link.parentElement)
    expect(button.tabIndex).toBe(0)
    expect(link.tabIndex).toBe(0)
    fireEvent.click(button)
    expect(onSaveToggle).toHaveBeenCalledTimes(1)
    expect(screen.queryByText('5')).toBeNull()
    expect(container.innerHTML).not.toContain('picsum.photos')
  })

  it('renders approved CDN media', () => {
    const { container } = render(
      <GuideCard g={{ ...guide, cover: 'https://cdn.kinnso.ai/test/guide.jpg' }} locale="en" />,
    )
    expect(container.querySelector('img')).toBeTruthy()
    expect(container.innerHTML).toContain('cdn.kinnso.ai')
  })
})
