// @vitest-environment jsdom
import { describe, it, expect, afterEach } from 'vitest'
import { render, screen, cleanup } from '@testing-library/react'
import en from '@/lib/i18n/messages/en'
import { StudioReadinessChecklist } from '@/components/kinnso/StudioReadinessChecklist'
import { computeReadiness } from '@/lib/studio/readiness'

afterEach(cleanup)

const partial = computeReadiness({
  handles: [{ platform: 'instagram' }],
  guidesCount: 0,
  dnaUpdatedAtIso: '2026-06-01T00:00:00Z',
  now: new Date('2026-06-10T00:00:00Z'),
})

describe('StudioReadinessChecklist', () => {
  it('renders the progress header with done/total', () => {
    render(<StudioReadinessChecklist directory={{ listed: true, gaps: [] }} locale="en" t={en.studioDashboard} readiness={partial} />)
    // 2 of 4 done: dna-ready + dna-fresh
    expect(screen.getByText(/2 \/ 4/)).toBeTruthy()
  })

  it('exposes per-item done state via data attributes', () => {
    render(<StudioReadinessChecklist directory={{ listed: true, gaps: [] }} locale="en" t={en.studioDashboard} readiness={partial} />)
    expect(screen.getByTestId('readiness-dna-ready').getAttribute('data-done')).toBe('true')
    expect(screen.getByTestId('readiness-write-guide').getAttribute('data-done')).toBe('false')
    expect(screen.getByTestId('readiness-connect-platforms').getAttribute('data-done')).toBe('false')
    expect(screen.getByTestId('readiness-dna-fresh').getAttribute('data-done')).toBe('true')
  })

  it('links the write-guide CTA to the new-guide page when not done', () => {
    render(<StudioReadinessChecklist directory={{ listed: true, gaps: [] }} locale="en" t={en.studioDashboard} readiness={partial} />)
    const link = screen.getByRole('link', { name: en.studioDashboard.itemWriteGuideCta })
    expect(link.getAttribute('href')).toBe('/en/studio/guides/new')
  })

  it('renders an injected slot in place of the default connect CTA', () => {
    render(
      <StudioReadinessChecklist directory={{ listed: true, gaps: [] }}
        locale="en"
        t={en.studioDashboard}
        readiness={partial}
        slots={{ 'connect-platforms': <button type="button">SLOT-ADD</button> }}
      />,
    )
    expect(screen.getByRole('button', { name: 'SLOT-ADD' })).toBeTruthy()
  })

  it('tells a creator with only drafts that a published guide is what lists them', () => {
    render(
      <StudioReadinessChecklist
        directory={{ listed: false, gaps: ['no_published_guide'] }}
        locale="en"
        t={en.studioDashboard}
        readiness={partial}
      />,
    )
    expect(screen.getByText(en.studioDashboard.directoryNeedsGuide)).toBeTruthy()
  })

  it('confirms listing when the creator already qualifies', () => {
    render(
      <StudioReadinessChecklist
        directory={{ listed: true, gaps: [] }}
        locale="en"
        t={en.studioDashboard}
        readiness={partial}
      />,
    )
    expect(screen.getByText(en.studioDashboard.directoryListed)).toBeTruthy()
  })
})
