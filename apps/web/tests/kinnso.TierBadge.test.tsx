// @vitest-environment jsdom
import { describe, it, expect, afterEach } from 'vitest'
import { render, screen, cleanup } from '@testing-library/react'
import TierBadge from '@/components/kinnso/TierBadge'

afterEach(cleanup)

describe('TierBadge', () => {
  it('renders the tier label from tierMeta', () => {
    render(<TierBadge tier="pro" />)
    expect(screen.getByText('Pro')).toBeTruthy()
  })

  it('appends the score when showScore is set', () => {
    render(<TierBadge tier="elite" score={92} showScore />)
    expect(screen.getByText('Elite')).toBeTruthy()
    expect(screen.getByText(/92/)).toBeTruthy()
  })
})
