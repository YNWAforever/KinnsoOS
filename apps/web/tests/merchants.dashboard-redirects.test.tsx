// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from 'vitest'

const { authMock, resolveViewerRoleMock } = vi.hoisted(() => ({
  authMock: vi.fn(),
  resolveViewerRoleMock: vi.fn(),
}))

vi.mock('next/navigation', () => ({
  notFound: () => { throw new Error('notFound') },
  redirect: (url: string) => { throw new Error(`redirect:${url}`) },
  permanentRedirect: (url: string) => { throw new Error(`permanentRedirect:${url}`) },
}))

vi.mock('@/lib/supabase/server', () => ({
  createSupabaseServerClient: async () => ({ auth: { getUser: authMock } }),
}))

vi.mock('@/lib/auth/viewer-role', () => ({
  resolveViewerRole: resolveViewerRoleMock,
}))

import PostStub from '@/app/[locale]/merchants/post/page'
import MissionsStub from '@/app/[locale]/merchants/missions/page'
import MissionDetailStub from '@/app/[locale]/merchants/missions/[missionId]/page'
import CreatorsStub from '@/app/[locale]/merchants/creators/page'
import InsightsStub from '@/app/[locale]/merchants/insights/page'

const params = <T extends Record<string, string>>(extra?: T) =>
  Promise.resolve({ locale: 'en', ...(extra as T) })

beforeEach(() => {
  vi.clearAllMocks()
})

describe('public merchant post entry', () => {
  it('throws an auth lookup error unchanged instead of treating it as anonymous', async () => {
    const authError = new Error('auth service unavailable')
    authMock.mockResolvedValue({ data: { user: null }, error: authError })

    await expect(PostStub({ params: params() })).rejects.toBe(authError)
    expect(resolveViewerRoleMock).not.toHaveBeenCalled()
  })

  it('treats AuthSessionMissingError as a genuine anonymous session absence', async () => {
    const missingSessionError = Object.assign(new Error('Auth session missing!'), {
      name: 'AuthSessionMissingError',
    })
    authMock.mockResolvedValue({ data: { user: null }, error: missingSessionError })

    await expect(PostStub({ params: params() })).rejects.toThrow(
      'redirect:/en/merchants/apply',
    )
    expect(resolveViewerRoleMock).not.toHaveBeenCalled()
  })
  it('sends anonymous visitors to merchant application without resolving a role', async () => {
    authMock.mockResolvedValue({ data: { user: null }, error: null })

    await expect(PostStub({ params: params() })).rejects.toThrow(
      'redirect:/en/merchants/apply',
    )
    expect(resolveViewerRoleMock).not.toHaveBeenCalled()
  })

  it('sends merchants directly to the dashboard composer', async () => {
    authMock.mockResolvedValue({ data: { user: { id: 'u1' } } })
    resolveViewerRoleMock.mockResolvedValue('merchant')

    await expect(PostStub({ params: params() })).rejects.toThrow(
      'redirect:/en/merchants/dashboard/post',
    )
    expect(authMock).toHaveBeenCalledTimes(1)
    expect(resolveViewerRoleMock).toHaveBeenCalledWith(expect.any(Object), 'u1')
  })

  it.each(['traveler', 'creator', 'creator-pending'] as const)(
    'sends authenticated %s viewers to merchant application',
    async (role) => {
      authMock.mockResolvedValue({ data: { user: { id: 'u1' } } })
      resolveViewerRoleMock.mockResolvedValue(role)

      await expect(PostStub({ params: params() })).rejects.toThrow(
        'redirect:/en/merchants/apply',
      )
    },
  )

  it('invalid locale is notFound before auth lookup', async () => {
    await expect(
      PostStub({ params: Promise.resolve({ locale: 'xx' }) }),
    ).rejects.toThrow('notFound')
    expect(authMock).not.toHaveBeenCalled()
  })
})

describe('legacy merchant routes 308 to /merchants/dashboard/*', () => {
  it('missions', async () => {
    await expect(MissionsStub({ params: params() })).rejects.toThrow(
      'permanentRedirect:/en/merchants/dashboard/missions')
  })
  it('missions/[missionId] preserves the id', async () => {
    await expect(MissionDetailStub({ params: params({ missionId: 'm-123' }) })).rejects.toThrow(
      'permanentRedirect:/en/merchants/dashboard/missions/m-123')
  })
  it('creators', async () => {
    await expect(CreatorsStub({ params: params() })).rejects.toThrow(
      'permanentRedirect:/en/merchants/dashboard/creators')
  })
  it('insights', async () => {
    await expect(InsightsStub({ params: params() })).rejects.toThrow(
      'permanentRedirect:/en/merchants/dashboard/insights')
  })
})
