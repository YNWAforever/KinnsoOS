// @vitest-environment jsdom
import { cleanup, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

afterEach(cleanup)

const validDna = {
  bio: 'Tokyo on foot.',
  niches: ['Travel'],
  content_pillars: ['City walks'],
  tone: ['calm'],
  audience: { top_geos: ['HK'], top_locales: ['zh-HK'] },
  platforms: [{ platform: 'instagram', followers: 1000, verified: false }],
  languages: ['en'],
}

const {
  resolveViewerRoleMock,
  listMissionsMock,
  listOffersMock,
  listSettlementsMock,
  getUnreadNotificationCountMock,
  state,
} = vi.hoisted(() => ({
  resolveViewerRoleMock: vi.fn(async () => 'creator'),
  listMissionsMock: vi.fn(async () => ({ data: [] })),
  listOffersMock: vi.fn(async () => ({ data: [] })),
  listSettlementsMock: vi.fn(async () => ({ data: [] })),
  getUnreadNotificationCountMock: vi.fn(async () => 0),
  state: {
    user: { id: 'creator-1' } as { id: string } | null,
    creator: { display_name: 'May', status: 'active' } as { display_name: string | null; status: string } | null,
    dnaFinal: null as unknown,
    dnaUpdatedAt: '2026-06-21T00:00:00Z',
    handles: [{ platform: 'instagram', handle: 'may', url: null }],
    guides: [] as { id: string }[],
    activeJob: null as { id: string } | null,
  },
}))

vi.mock('next/navigation', () => ({
  notFound: vi.fn(() => { throw new Error('NEXT_NOT_FOUND') }),
  redirect: vi.fn((path: string) => { throw new Error(`NEXT_REDIRECT:${path}`) }),
  useRouter: () => ({ refresh: vi.fn() }),
}))

vi.mock('@/lib/auth/viewer-role', () => ({ resolveViewerRole: resolveViewerRoleMock }))

vi.mock('@/lib/missions/queries', () => ({
  listCreatorMerchantMissions: listMissionsMock,
  listAffiliateOffers: listOffersMock,
  listCreatorSettlements: listSettlementsMock,
}))

vi.mock('@/lib/notifications/queries', () => ({
  getUnreadNotificationCount: getUnreadNotificationCountMock,
}))

// Chainable supabase stub: builder is awaitable AND supports single/maybeSingle.
function builder(result: unknown) {
  const b: Record<string, unknown> = {
    select: () => b, eq: () => b, in: () => b, limit: () => b, order: () => b, neq: () => b,
    single: async () => result,
    maybeSingle: async () => result,
    then: (onF: (v: unknown) => unknown, onR?: (e: unknown) => unknown) => Promise.resolve(result).then(onF, onR),
  }
  return b
}

vi.mock('@/lib/supabase/server', () => ({
  createSupabaseServerClient: async () => ({
    auth: { getUser: async () => ({ data: { user: state.user } }) },
    from: (table: string) => {
      switch (table) {
        case 'creators': return builder({ data: state.creator })
        case 'creator_dna': return builder({ data: { final: state.dnaFinal, updated_at: state.dnaUpdatedAt } })
        case 'creator_social_handles': return builder({ data: state.handles })
        case 'guides': return builder({ data: state.guides })
        case 'creator_scan_jobs': return builder({ data: state.activeJob })
        default: return builder({ data: null })
      }
    },
  }),
}))

import StudioPage from '@/app/[locale]/studio/page'

beforeEach(() => {
  resolveViewerRoleMock.mockReset(); resolveViewerRoleMock.mockResolvedValue('creator')
  listMissionsMock.mockClear(); listOffersMock.mockClear(); listSettlementsMock.mockClear()
  getUnreadNotificationCountMock.mockClear(); getUnreadNotificationCountMock.mockResolvedValue(0)
  state.user = { id: 'creator-1' }
  state.creator = { display_name: 'May', status: 'active' }
  state.dnaFinal = validDna
  state.dnaUpdatedAt = '2026-06-21T00:00:00Z'
  state.handles = [{ platform: 'instagram', handle: 'may', url: null }]
  state.guides = []
  state.activeJob = null
})

const run = () => StudioPage({ params: Promise.resolve({ locale: 'en' }) })

describe('/[locale]/studio dashboard host', () => {
  it('redirects anonymous visitors to sign-in', async () => {
    state.user = null
    await expect(run()).rejects.toThrow('NEXT_REDIRECT:/en/sign-in')
  })

  it('redirects merchants to their home', async () => {
    resolveViewerRoleMock.mockResolvedValue('merchant')
    await expect(run()).rejects.toThrow('NEXT_REDIRECT:/en/merchants/dashboard/post')
  })

  it('redirects ops to their home', async () => {
    resolveViewerRoleMock.mockResolvedValue('ops')
    await expect(run()).rejects.toThrow('NEXT_REDIRECT:/en/admin/creators/payouts')
  })

  it('redirects onboarding creators to the wizard', async () => {
    state.creator = { display_name: 'May', status: 'onboarding' }
    await expect(run()).rejects.toThrow('NEXT_REDIRECT:/en/creator')
  })

  it('redirects active creators with invalid DNA to the wizard', async () => {
    state.dnaFinal = null
    await expect(run()).rejects.toThrow('NEXT_REDIRECT:/en/creator')
  })

  it('renders the dashboard for an active creator with valid DNA', async () => {
    const ui = await run()
    render(ui)
    expect(screen.getByText('Welcome back, May')).toBeTruthy()
    expect(screen.getByTestId('readiness')).toBeTruthy()
    expect(listMissionsMock).toHaveBeenCalled()
  })
})
