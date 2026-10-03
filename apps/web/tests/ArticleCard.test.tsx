// @vitest-environment jsdom
import { describe, it, expect, afterEach } from 'vitest'
import { render, screen, cleanup } from '@testing-library/react'
import { ArticleCard } from '@/components/ArticleCard'

afterEach(cleanup)

describe('ArticleCard', () => {
  it('wraps the whole card in a single link with a decorative read arrow', () => {
    render(<ArticleCard href="/en/articles/destinations/kyoto-tea" title="Kyoto Tea" summary="Lovely tea houses." />)
    const link = screen.getByRole('link', { name: 'Kyoto Tea' })
    expect(link.getAttribute('href')).toBe('/en/articles/destinations/kyoto-tea')
    expect(link.querySelector(':scope > div.p-4 > span[aria-hidden="true"]')?.textContent).toContain('\u2192')
  })
  it('fails closed for non-CDN thumbnails', () => {
    const { container } = render(<ArticleCard href="/en/articles/destinations/tea" title="Tea" thumbnail="https://picsum.photos/tea.jpg" />)
    expect(container.querySelector('[data-media-placeholder="true"]')).toBeTruthy()
    expect(container.innerHTML).not.toContain('picsum.photos')
  })

  it('renders approved CDN media', () => {
    const { container } = render(
      <ArticleCard href="/en/articles/destinations/tea" title="Tea" thumbnail="https://cdn.kinnso.ai/test/article.jpg" />,
    )
    expect(container.querySelector('img')).toBeTruthy()
    expect(container.innerHTML).toContain('cdn.kinnso.ai')
  })
})
