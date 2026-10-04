// @vitest-environment jsdom
import { describe, it, expect, afterEach, vi } from 'vitest'
import { render, screen, cleanup } from '@testing-library/react'

afterEach(cleanup)
vi.mock('next/navigation', () => ({ notFound: () => { throw new Error('NEXT_NOT_FOUND') } }))

import AboutPage from '@/app/[locale]/about/page'
import en from '@/lib/i18n/messages/en'

describe('/[locale]/about host', () => {
  it('renders the real About page (not a Coming Soon stub)', async () => {
    const ui = await AboutPage({ params: Promise.resolve({ locale: 'en' }) })
    render(ui)
    expect(screen.getByRole('heading', { level: 1, name: en.about.title })).toBeTruthy()
    expect(screen.getByText(en.about.missionHeading)).toBeTruthy()
    expect(screen.getByRole('link', { name: en.about.ctaButton }).getAttribute('href')).toBe('/en/sign-up')
    expect(screen.queryByText(en.comingSoon.heading)).toBeNull()
  })
})
