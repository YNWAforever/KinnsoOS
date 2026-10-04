// @vitest-environment jsdom
import { describe, it, expect, afterEach } from 'vitest'
import { render, screen, cleanup } from '@testing-library/react'

afterEach(cleanup)

import { ExperienceLinkCard } from '@/components/kinnso/ExperienceLinkCard'
import type { PublicExperience } from '@/lib/experiences/public-queries'

const experience: PublicExperience = {
  id: 'e1', slug: 'sunset-tour', title: 'Sunset junk boat tour', summary: null, description: null,
  city: 'Hong Kong', priceAmount: 480, currency: 'HKD', durationMinutes: null, coverUrl: null,
  publishedAt: null, savesCount: 0, merchant: { slug: 'acme', companyName: 'Acme Travel' },
}

describe('ExperienceLinkCard', () => {
  it('links to the experience page with the given query string appended', () => {
    render(<ExperienceLinkCard locale="en" experience={experience} hrefQuery="src=article" />)
    const link = screen.getByRole('link', { name: /Sunset junk boat tour/ })
    expect(link.getAttribute('href')).toBe('/en/experiences/sunset-tour?src=article')
  })
  it('renders city, currency, and price', () => {
    render(<ExperienceLinkCard locale="en" experience={experience} hrefQuery="src=article" />)
    expect(screen.getByText('Hong Kong · HKD 480')).toBeTruthy()
  })
})
