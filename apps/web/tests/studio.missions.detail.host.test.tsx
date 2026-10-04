// @vitest-environment jsdom
import { cleanup, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

afterEach(cleanup)

const {
  getCreatorMissionDetailMock,
  notFoundMock,
  creatorPageGateMock,
  submitMilestoneActionMock,
} = vi.hoisted(() => ({
  getCreatorMissionDetailMock: vi.fn(async () => ({
    data: {
      id: 'm1',
      title: 'Test Mission',
      summary: 'Summary',
      mission_source: 'merchant',
      mission_type: 'paid',
      status: 'published',
      coupon_code: null,
      coupon_url: null,
      paid_fee_amount: 5000,
      paid_fee_currency: 'HKD',
      affiliate_commission_rate: null,
      creator_commission_rate: null,
      kinnso_commission_rate: null,
      affiliate_network_programs: null,
      mission_milestones: [{ id: 'ms1', title: 'Post a reel', description: 'A reel', due_at: null, sort_order: 0 }],
      mission_participants: [{
        id: 'p1',
        status: 'active',
        source: 'application',
        creator_id: 'creator-user-1',
        application_note: null,
        mission_milestone_submissions: [],
      }],
      affiliate_partner_links: [],
    },
  })),
  notFoundMock: vi.fn(() => { throw new Error('NEXT_NOT_FOUND') }),
  creatorPageGateMock: vi.fn(async () => ({ user: { id: 'creator-user-1' } })),
  submitMilestoneActionMock: vi.fn(async () => ({ ok: true as const, submissionId: 'sub-new' })),
}))

vi.mock('next/navigation', () => ({
  notFound: notFoundMock,
  redirect: vi.fn((path: string) => { throw new Error(`NEXT_REDIRECT:${path}`) }),
  useRouter: () => ({ refresh: vi.fn() }),
}))

vi.mock('@/lib/admin/guard', () => ({
  requireCreatorPage: creatorPageGateMock,
}))

vi.mock('@/lib/missions/queries', () => ({
  getCreatorMissionDetail: getCreatorMissionDetailMock,
}))

vi.mock('@/lib/contribution/queries', () => ({
  getCreatorStoredTier: vi.fn(async () => 'seed'),
}))

vi.mock('@/lib/missions/actions', () => ({
  joinMissionAction: vi.fn(async () => ({ ok: true })),
  submitMilestoneAction: submitMilestoneActionMock,
}))

vi.mock('@/lib/supabase/server', () => ({
  createSupabaseServerClient: async () => ({
    auth: {
      getUser: async () => ({ data: { user: { id: 'creator-user-1' } } }),
    },
  }),
}))

vi.mock('@/lib/supabase/client', () => ({
  createSupabaseBrowserClient: () => ({
    channel: () => ({ on: () => ({ subscribe: () => ({}) }) }),
    removeChannel: vi.fn(),
    from: vi.fn().mockReturnValue({
      select: () => ({ eq: () => ({ single: async () => ({ data: null }) }) }),
    }),
  }),
}))

vi.mock('@/lib/missions/verify-client', () => ({
  startVerification: vi.fn(async () => ({ error: 'unconfigured' as const })),
  retryVerification: vi.fn(),
}))

import StudioMissionDetailPage from '@/app/[locale]/studio/missions/[id]/page'

beforeEach(() => {
  creatorPageGateMock.mockResolvedValue({ user: { id: 'creator-user-1' } })
})

describe('/[locale]/studio/missions/[id] host', () => {
  it('renders not found for non-creator viewers', async () => {
    creatorPageGateMock.mockRejectedValueOnce(new Error('NEXT_NOT_FOUND'))
    await expect(
      StudioMissionDetailPage({ params: Promise.resolve({ locale: 'en', id: 'm1' }) }),
    ).rejects.toThrow('NEXT_NOT_FOUND')
  })

  it('renders the mission title for an active creator', async () => {
    const ui = await StudioMissionDetailPage({ params: Promise.resolve({ locale: 'en', id: 'm1' }) })
    render(ui)
    expect(screen.getByRole('heading', { level: 1, name: 'Test Mission' })).toBeTruthy()
  })

  it('passes a submitMilestone thunk that calls submitMilestoneAction with the participant id', async () => {
    const ui = await StudioMissionDetailPage({ params: Promise.resolve({ locale: 'en', id: 'm1' }) })
    render(ui)

    // Extract the onSubmitMilestone prop by calling it directly via the rendered page's thunk.
    // We do this by triggering the thunk indirectly — the page passes `submitMilestone` as
    // `onSubmitMilestone`. We get access by calling the page function again and inspecting.
    // Simpler approach: call the page a second time and capture the returned element's props.
    // Actually, the cleanest approach is to test the thunk via the page's server function.
    // Re-call the page to get the element tree and find the thunk:
    const page2 = await StudioMissionDetailPage({ params: Promise.resolve({ locale: 'en', id: 'm1' }) })

    // The page returns a React element. We call its props.onSubmitMilestone directly.
    type PageElement = { props: { onSubmitMilestone: (input: { milestoneId: string; proofUrl: string; notes: string }) => Promise<unknown> } }
    const onSubmitMilestone = (page2 as unknown as PageElement).props.onSubmitMilestone

    await onSubmitMilestone({ milestoneId: 'ms1', proofUrl: 'https://www.instagram.com/p/Test/', notes: 'great post' })

    expect(submitMilestoneActionMock).toHaveBeenCalledWith({
      missionId: 'm1',
      participantId: 'p1',
      milestoneId: 'ms1',
      proofUrl: 'https://www.instagram.com/p/Test/',
      notes: 'great post',
      locale: 'en',
    })
  })
})
