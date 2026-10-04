// @vitest-environment jsdom
import { describe, it, expect, afterEach } from 'vitest'
import { render, screen, cleanup } from '@testing-library/react'

afterEach(cleanup)
import { CreatorProfileView } from '@/components/kinnso/pages/CreatorProfileView'
import en from '@/lib/i18n/messages/en'
import type { PublicCreator } from '@/lib/creators/queries'

const creator: PublicCreator = {
  id: 'creator-1',
  avatarUrl: null,
  handle: 'maya',
  name: 'Maya Wanders',
  bio: 'Slow travel in Asia.',
  profile: {
    niches: ['Coffee', 'City Walk'],
    content_pillars: ['Cafes'],
    tone: ['calm'],
    audience_geos: ['HK', 'TW'],
    audience_locales: ['zh-HK'],
    languages: ['en', 'zh-HK'],
    platforms: [{ platform: 'instagram', verified: false }],
  },
  guides: [
    { slug: 'osaka', title: 'Osaka in a day', cover: 'https://picsum.photos/osaka.jpg', city: 'Osaka', saves: 12, creatorHandle: 'maya' },
  ],
}

const render0 = () =>
  render(<CreatorProfileView creator={creator} locale="en" t={en.creatorProfile} />)

describe('CreatorProfileView', () => {
  it('renders identity + qualitative DNA, no fabricated metrics', () => {
    const { container } = render0()
    expect(screen.getByRole('heading', { level: 1, name: 'Maya Wanders' })).toBeInTheDocument()
    expect(screen.getAllByText('@maya')[0]).toBeInTheDocument()
    expect(screen.getByText('Slow travel in Asia.')).toBeInTheDocument()
    expect(screen.getByText('Coffee')).toBeInTheDocument()
    expect(screen.getByText('instagram')).toBeInTheDocument()
    expect(screen.queryByText('/100')).not.toBeInTheDocument()
    expect(screen.getByText(en.creatorProfile.guidesHeading)).toBeInTheDocument()
    expect(container.querySelector('[data-media-placeholder="true"]')).toBeTruthy()
    expect(container.innerHTML).not.toContain('picsum.photos')
  })

  it('links published guides under the active locale', () => {
    render0()
    const link = screen.getByRole('link', { name: /Osaka in a day/i })
    expect(link.getAttribute('href')).toBe('/en/g/osaka')
  })

  it('omits the guides section when the creator has no guides', () => {
    render(<CreatorProfileView creator={{ ...creator, guides: [] }} locale="en" t={en.creatorProfile} />)
    expect(screen.queryByRole('heading', { name: en.creatorProfile.guidesHeading })).not.toBeInTheDocument()
  })
})
