// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, render, screen } from '@testing-library/react'

const dialogProps = vi.hoisted(() => ({ value: null as Record<string, unknown> | null }))

vi.mock('@/components/kinnso/media/EntityMedia', () => ({
  EntityMedia: ({ src }: { src: string | null }) => <img data-avatar-src={src ?? ''} alt="" />,
}))
vi.mock('@/components/kinnso/enquiries/EnquiryDialog', () => ({
  EnquiryDialog: (props: Record<string, unknown>) => {
    dialogProps.value = props
    return <button type="button">{props.triggerLabel as string}</button>
  },
}))

import { CreatorProfileView } from '@/components/kinnso/pages/CreatorProfileView'
import type { PublicCreator } from '@/lib/creators/queries'
import en from '@/lib/i18n/messages/en'

afterEach(cleanup)

const ProfileView = CreatorProfileView as unknown as (props: Record<string, unknown>) => React.ReactNode
const messages = { ...en.creatorProfile, articlesHeading: 'Articles', sessionsHeading: 'Sessions' }
const baseCreator = {
  id: '123e4567-e89b-42d3-a456-426614174000', handle: 'ada', name: 'Ada Wong', bio: 'Local travel writer.', avatarUrl: null,
  profile: { niches: [], content_pillars: [], tone: [], audience_geos: [], audience_locales: [], languages: [], platforms: [] },
  guides: [],
} as unknown as PublicCreator

describe('CreatorProfileView hardening', () => {
  it('omits every optional section when no public profile content exists', () => {
    render(<ProfileView creator={{ ...baseCreator, profile: { ...baseCreator.profile, tone: ['private'], audience_locales: ['zh-hk'] } }}
      locale="en" t={messages} enquiry={en.enquiry} articles={[]} sessions={[]} />)

    for (const heading of ['Niches', 'Content pillars', 'Top regions', 'Languages', 'Platforms', 'Published guides', 'Articles', 'Sessions']) {
      expect(screen.queryByRole('heading', { name: heading })).not.toBeInTheDocument()
    }
    expect(screen.queryByText('Tone')).not.toBeInTheDocument()
    expect(screen.queryByText('Audience locales')).not.toBeInTheDocument()
  })

  it('uses human display names, stored compact followers, avatar URL, and the enquiry dialog without private markup', () => {
    const { container } = render(<ProfileView creator={{
      ...baseCreator,
      avatarUrl: 'https://cdn.example.test/ada.jpg',
      profile: {
        niches: ['City walks'], content_pillars: ['Food'], tone: ['private'],
        audience_geos: ['HK'], audience_locales: ['zh-hk'], languages: ['zh-HK'],
        platforms: [{ platform: 'instagram', verified: true, followers: 12500 }],
      },
    } as unknown as PublicCreator} locale="en" t={messages} enquiry={en.enquiry} articles={[]} sessions={[]} />)

    expect(screen.getByRole('button', { name: 'Work with Ada Wong' })).toBeVisible()
    expect(screen.getByText('Chinese (Hong Kong)')).toBeVisible()
    expect(screen.getByText('Hong Kong SAR China')).toBeVisible()
    expect(screen.getByText('12.5K')).toBeVisible()
    expect(screen.queryByText('zh-hk')).not.toBeInTheDocument()
    expect(screen.queryByText('HK')).not.toBeInTheDocument()
    expect(screen.queryByText('Tone')).not.toBeInTheDocument()
    expect(screen.queryByText('Audience locales')).not.toBeInTheDocument()
    expect(container.querySelector('[data-avatar-src="https://cdn.example.test/ada.jpg"]')).toBeTruthy()
    expect(dialogProps.value).toMatchObject({ type: 'creator_collab', targetId: '123e4567-e89b-42d3-a456-426614174000', targetName: 'Ada Wong', t: en.enquiry })
  })
})
