// @vitest-environment jsdom
import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import { ArticleBlockRenderer } from '@/components/ArticleBlockRenderer'

const blocks = [
  { type: 'text', id: 'block-0', title: 'Intro', content: '<p>Hello <strong>world</strong></p>' },
  { type: 'number-box', id: 'block-1', title: 'First', content: '<p>one</p>' },
  { type: 'number-box', id: 'block-2', title: 'Second', content: '<p>two</p>' },
  { type: 'offer-box', id: 'block-3', title: 'Deal', content: '<p>10% off</p>' },
  { type: 'detail-box', id: 'block-4', title: 'Info', time: '11-22', price: '¥1000' },
  { type: 'info-box', id: 'block-5', content: '<p>note</p>' },
  { type: 'attraction-box', id: 'block-6', attraction: 'x' },         // unknown -> nothing
  { type: 'text', id: 'block-7', content: '<p onclick="evil()">safe</p><script>evil()</script>' },
]

describe('ArticleBlockRenderer', () => {
  it('renders block id anchors for known types and skips unknown', () => {
    const { container } = render(<ArticleBlockRenderer blocks={blocks} />)
    expect(container.querySelector('#block-0')).not.toBeNull()
    expect(container.querySelector('#block-5')).not.toBeNull()
    expect(container.querySelector('#block-6')).toBeNull()   // attraction-box dropped
  })
  it('numbers number-box blocks in order', () => {
    render(<ArticleBlockRenderer blocks={blocks} />)
    expect(screen.getAllByText('1').length).toBeGreaterThan(0)
    expect(screen.getAllByText('2').length).toBeGreaterThan(0)
  })
  it('sanitizes block HTML (no scripts/handlers)', () => {
    const { container } = render(<ArticleBlockRenderer blocks={blocks} />)
    expect(container.querySelector('script')).toBeNull()
    expect(container.innerHTML).not.toContain('onclick')
    expect(container.innerHTML).toContain('<strong>world</strong>')
  })
})
