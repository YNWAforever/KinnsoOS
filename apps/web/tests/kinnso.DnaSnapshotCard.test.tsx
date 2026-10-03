// @vitest-environment jsdom
import { describe, it, expect, afterEach } from 'vitest'
import { render, screen, cleanup } from '@testing-library/react'
import en from '@/lib/i18n/messages/en'
import { DnaSnapshotCard } from '@/components/kinnso/DnaSnapshotCard'
import type { Dna } from '@kinnso/scan'

afterEach(cleanup)

const dna: Dna = {
  bio: 'Tokyo on foot.',
  niches: ['Travel', 'Coffee'],
  content_pillars: ['City walks', 'Cafés'],
  tone: ['calm'],
  audience: { top_geos: ['HK'], top_locales: ['zh-HK'] },
  platforms: [
    { platform: 'instagram', followers: 27400, verified: false },
    { platform: 'youtube', verified: false },
  ],
  languages: ['en'],
}

describe('DnaSnapshotCard', () => {
  it('renders niches, pillars and a link to the full report', () => {
    render(<DnaSnapshotCard locale="en" t={en.studioDashboard} dna={dna} lastScanned="2026-06-21T00:00:00Z" />)
    expect(screen.getByText('Travel')).toBeTruthy()
    expect(screen.getByText('City walks')).toBeTruthy()
    const link = screen.getByRole('link', { name: en.studioDashboard.viewFullReport })
    expect(link.getAttribute('href')).toBe('/en/studio/scan')
  })

  it('shows the last-scanned date sliced to YYYY-MM-DD', () => {
    render(<DnaSnapshotCard locale="en" t={en.studioDashboard} dna={dna} lastScanned="2026-06-21T09:30:00Z" />)
    expect(screen.getByText(/2026-06-21/)).toBeTruthy()
  })
})
