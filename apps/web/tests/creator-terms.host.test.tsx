// @vitest-environment jsdom
import { describe, it, expect, afterEach, vi } from 'vitest'
import { render, screen, cleanup } from '@testing-library/react'

afterEach(cleanup)
vi.mock('next/navigation', () => ({ notFound: () => { throw new Error('NEXT_NOT_FOUND') } }))

import CreatorTermsPage from '@/app/[locale]/legal/creator-terms/page'
import en from '@/lib/i18n/messages/en'

describe('/[locale]/legal/creator-terms host', () => {
  it('renders real terms with the MVP-draft + English notices', async () => {
    const ui = await CreatorTermsPage({ params: Promise.resolve({ locale: 'en' }) })
    render(ui)
    expect(screen.getByRole('heading', { level: 1, name: en.creatorTerms.title })).toBeTruthy()
    expect(screen.getByText(en.creatorTerms.draftNotice)).toBeTruthy()
    expect(screen.getByText(en.creatorTerms.englishNotice)).toBeTruthy()
    expect(screen.getByText('Commissions & earnings')).toBeTruthy()
    expect(screen.queryByText(en.comingSoon.heading)).toBeNull()
  })
})
