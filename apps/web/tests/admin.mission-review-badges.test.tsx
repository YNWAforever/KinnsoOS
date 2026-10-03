// @vitest-environment jsdom
import { cleanup, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it } from 'vitest'
import { ConfidenceBadge } from '@/components/kinnso/admin/missions/badges'
import en from '@/lib/i18n/messages/en'

afterEach(cleanup)

const t = en.missionsOps

describe('ConfidenceBadge', () => {
  it('renders the Verified label for verified_signal', () => {
    render(<ConfidenceBadge status="verified_signal" t={t} />)
    expect(screen.getByText('Verified')).toBeTruthy()
  })
  it('renders the Needs review label for needs_review', () => {
    render(<ConfidenceBadge status="needs_review" t={t} />)
    expect(screen.getByText('Needs review')).toBeTruthy()
  })
  it('renders the Unavailable label for null (no verification job yet)', () => {
    render(<ConfidenceBadge status={null} t={t} />)
    expect(screen.getByText('Unavailable')).toBeTruthy()
  })
})
