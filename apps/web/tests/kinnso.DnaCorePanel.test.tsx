// @vitest-environment jsdom
import { describe, it, expect, afterEach } from 'vitest'
import { render, screen, cleanup } from '@testing-library/react'
import DnaCorePanel from '@/components/kinnso/DnaCorePanel'
import { sampleDna } from '@/lib/creator-mock'
import en from '@/lib/i18n/messages/en'
import type { Dna } from '@kinnso/scan'

afterEach(cleanup)

describe('DnaCorePanel', () => {
  it('renders the heading, bio, a niche, a tone, and a platform row', () => {
    render(<DnaCorePanel dna={sampleDna} t={en.studio} />)
    expect(screen.getByText(en.studio.dnaCoreHeading)).toBeTruthy()
    expect(screen.getByText(sampleDna.bio)).toBeTruthy()
    expect(screen.getByText(sampleDna.niches[0])).toBeTruthy()
    expect(screen.getByText(sampleDna.tone[0])).toBeTruthy()
    expect(screen.getByText(/Instagram/)).toBeTruthy()
  })

  it('omits optional rows when their arrays are empty (no crash)', () => {
    const sparse: Dna = {
      bio: '',
      niches: [],
      content_pillars: [],
      tone: [],
      audience: {},
      platforms: [],
      languages: [],
    }
    render(<DnaCorePanel dna={sparse} t={en.studio} />)
    // Heading still renders; no chip-row labels are present.
    expect(screen.getByText(en.studio.dnaCoreHeading)).toBeTruthy()
    expect(screen.queryByText(en.studio.dnaNiches)).toBeNull()
    expect(screen.queryByText(en.studio.dnaPlatforms)).toBeNull()
  })
})
