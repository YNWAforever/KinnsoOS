// @vitest-environment jsdom
import { describe, it, expect, afterEach } from 'vitest'
import { render, screen, cleanup } from '@testing-library/react'
import ScoreRing from '@/components/kinnso/ScoreRing'

afterEach(cleanup)

describe('ScoreRing', () => {
  it('renders the numeric score', () => {
    render(<ScoreRing score={88} />)
    expect(screen.getByText('88')).toBeTruthy()
  })

  it('renders the /100 suffix and label when requested at md size', () => {
    render(<ScoreRing score={73} showOutOf label="DNA" />)
    expect(screen.getByText('/ 100')).toBeTruthy()
    expect(screen.getByText('DNA')).toBeTruthy()
  })

  it('omits the /100 suffix at sm size', () => {
    render(<ScoreRing score={50} size="sm" showOutOf />)
    expect(screen.queryByText('/ 100')).toBeNull()
  })
})
