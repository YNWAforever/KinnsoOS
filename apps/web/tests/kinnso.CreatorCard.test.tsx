// @vitest-environment jsdom
import { describe, expect, it } from 'vitest'
import { render, screen } from '@testing-library/react'
import CreatorCard from '@/components/kinnso/CreatorCard'
import { creators } from '@/lib/creator-mock'

describe('CreatorCard', () => {
  it('renders as a creator pass with explicit avatar dimensions', () => {
    render(<CreatorCard c={creators[0]} locale="en" />)
    const img = screen.getByRole('img', { name: creators[0].name })
    expect(img.getAttribute('width')).toBe('80')
    expect(img.getAttribute('height')).toBe('80')
    expect(document.querySelector('.k-ticket')).toBeTruthy()
  })
})
