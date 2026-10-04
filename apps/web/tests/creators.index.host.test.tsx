// @vitest-environment jsdom
import { describe, it, expect, vi, afterEach } from 'vitest'
import { render, screen, cleanup } from '@testing-library/react'
import type { CreatorSummary } from '@/lib/creators/queries'

afterEach(cleanup)

const creators: CreatorSummary[] = [
  { handle: 'maya', name: 'Maya Wanders', bio: 'Slow travel.', niches: ['Coffee'], guideCount: 2 },
]

vi.mock('@/lib/creators/queries', () => ({ getPublicCreators: vi.fn(async () => creators) }))
vi.mock('next/navigation', () => ({ notFound: () => { throw new Error('NEXT_NOT_FOUND') } }))

import CreatorsPage from '@/app/[locale]/creators/page'

describe('/[locale]/creators host', () => {
  it('renders the directory from real creators', async () => {
    const ui = await CreatorsPage({ params: Promise.resolve({ locale: 'en' }) })
    render(ui)
    expect(screen.getAllByText('Maya Wanders').length).toBeGreaterThan(0)
    expect(screen.getByRole('link', { name: /view profile/i }).getAttribute('href')).toBe('/en/c/maya')
  })
})
