// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, render, screen } from '@testing-library/react'

const dialogProps = vi.hoisted(() => ({ value: null as Record<string, unknown> | null }))
vi.mock('@/components/kinnso/media/EntityMedia', () => ({
  EntityMedia: () => <div data-media="mock" />,
}))
vi.mock('@/components/kinnso/enquiries/EnquiryDialog', () => ({
  EnquiryDialog: (props: Record<string, unknown>) => {
    dialogProps.value = props
    return <button type="button">{props.triggerLabel as string}</button>
  },
}))

import { CreatorProfileView } from '@/components/kinnso/pages/CreatorProfileView'
import en from '@/lib/i18n/messages/en'
import type { PublicCreator } from '@/lib/creators/queries'

afterEach(cleanup)

const validId = '123e4567-e89b-42d3-a456-426614174000'
const creator = {
  id: validId, handle: 'ada', name: 'Ada Wong', bio: '', avatarUrl: null,
  profile: { niches: [], content_pillars: [], tone: [], audience_geos: [], audience_locales: [], languages: [], platforms: [] },
  guides: [],
} as unknown as PublicCreator
const related = { articlesHeading: 'Articles', sessionsHeading: 'Sessions' }

describe('CreatorProfileView review fixes', () => {
  it('uses the canonical article-category route mapping in rendered cards', () => {
    render(<CreatorProfileView creator={creator} locale="en" t={en.creatorProfile} enquiry={en.enquiry} related={related}
      articles={[
        { id: 'a1', url: 'harbour', category: 'destination', title: 'Harbour', summary: '', thumbnail: null, publishedAt: '2026-07-01T00:00:00Z' },
        { id: 'a2', url: 'noodles', category: 'dining', title: 'Noodles', summary: '', thumbnail: null, publishedAt: '2026-07-02T00:00:00Z' },
      ]} sessions={[]} />)

    expect(screen.getByRole('link', { name: 'Harbour' })).toHaveAttribute('href', '/en/articles/destinations/harbour')
    expect(screen.getByRole('link', { name: 'Noodles' })).toHaveAttribute('href', '/en/articles/dining/noodles')
  })

  it('shows and wires the enquiry CTA only for Task 3-valid UUID creator IDs', () => {
    const { rerender } = render(<CreatorProfileView creator={creator} locale="en" t={en.creatorProfile} enquiry={en.enquiry} related={related} articles={[]} sessions={[]} />)
    expect(screen.getByRole('button', { name: 'Work with Ada Wong' })).toBeVisible()
    expect(dialogProps.value).toMatchObject({ targetId: validId, type: 'creator_collab' })

    rerender(<CreatorProfileView creator={{ ...creator, id: 'creator-1' }} locale="en" t={en.creatorProfile} enquiry={en.enquiry} related={related} articles={[]} sessions={[]} />)
    expect(screen.queryByRole('button', { name: 'Work with Ada Wong' })).not.toBeInTheDocument()

    rerender(<CreatorProfileView creator={{ ...creator, id: '' }} locale="en" t={en.creatorProfile} enquiry={en.enquiry} related={related} articles={[]} sessions={[]} />)
    expect(screen.queryByRole('button', { name: 'Work with Ada Wong' })).not.toBeInTheDocument()
  })

  it('omits articles entirely when no article category has a public route', () => {
    render(
      <CreatorProfileView
        creator={creator}
        locale="en"
        t={en.creatorProfile}
        enquiry={en.enquiry}
        related={related}
        articles={[
          {
            id: 'legacy',
            url: 'legacy',
            category: 'legacy',
            title: 'Legacy',
            summary: '',
            thumbnail: null,
            publishedAt: '2026-07-26T00:00:00.000Z',
          },
        ]}
        sessions={[]}
      />,
    )

    expect(screen.queryByRole('heading', { name: 'Articles' })).not.toBeInTheDocument()
    expect(screen.queryByRole('link', { name: 'Legacy' })).not.toBeInTheDocument()
  })
})
