import type { ReactElement } from 'react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { GuideInput } from '@/lib/guides/types'

const { creatorPageGateMock, maybeSingleMock, rpcMock, notFoundMock, redirectMock } = vi.hoisted(() => ({
  creatorPageGateMock: vi.fn(),
  maybeSingleMock: vi.fn(),
  rpcMock: vi.fn(),
  notFoundMock: vi.fn(),
  redirectMock: vi.fn(),
}))

vi.mock('next/navigation', () => ({
  notFound: notFoundMock,
  redirect: redirectMock,
}))

// The page delegates its role check to the central guard, so the guard is
// mocked rather than the raw client. Mocking the client alone would feed the
// guard's own role lookups from this file's single `maybeSingle` stub and make
// the page's gate depend on the guide fixture.
vi.mock('@/lib/admin/guard', () => ({ requireCreatorPage: creatorPageGateMock }))

vi.mock('@/lib/supabase/server', () => ({
  createSupabaseServerClient: async () => {
    const query = {
      select: vi.fn(),
      eq: vi.fn(),
      maybeSingle: maybeSingleMock,
    }
    query.select.mockReturnValue(query)
    query.eq.mockReturnValue(query)
    return {
      from: vi.fn(() => query),
      rpc: rpcMock,
    }
  },
}))

import StudioEditGuidePage from '@/app/[locale]/studio/guides/[id]/edit/page'

beforeEach(() => {
  vi.clearAllMocks()
  creatorPageGateMock.mockResolvedValue({ user: { id: 'creator-1' } })
  rpcMock.mockResolvedValue({data:{version:3},error:null})
})

describe('StudioEditGuidePage', () => {
  it('normalizes a nullable stored cover to the form empty-string boundary', async () => {
    maybeSingleMock.mockResolvedValue({
      data: {
        id: 'guide-1',
        title: 'Honest guide',
        city: 'Hong Kong',
        cover_url: null,
        summary: 'A useful guide summary',
      },
    })

    const result = await StudioEditGuidePage({
      params: Promise.resolve({ locale: 'en', id: 'guide-1' }),
    }) as ReactElement<{ children: ReactElement<{ initial: GuideInput; initialVersion: number }>[] }>

    expect(result.props.children[0].props.initial.coverUrl).toBe('')
    expect(result.props.children[1].props.initialVersion).toBe(3)
    expect(rpcMock).toHaveBeenCalledWith('kinnso_guide_authoring', {p_guide_id:'guide-1'})
    expect(notFoundMock).not.toHaveBeenCalled()
    expect(redirectMock).not.toHaveBeenCalled()
  })

  it('does not read authoring content when the central creator gate rejects access', async () => {
    creatorPageGateMock.mockRejectedValueOnce(new Error('creator access denied'))
    await expect(StudioEditGuidePage({params:Promise.resolve({locale:'en',id:'guide-1'})})).rejects.toThrow('creator access denied')
    expect(maybeSingleMock).not.toHaveBeenCalled()
    expect(rpcMock).not.toHaveBeenCalled()
  })
  it('recovers the authored itinerary on reload instead of presenting a blank replacement',async()=>{
    const content={days:[{offset:0,title:'Existing day',stops:[{title:'Existing authored stop',description:'Existing public description',placeId:null,startMinuteOfDay:600,durationMinutes:30}]}]}
    maybeSingleMock.mockResolvedValue({data:{id:'guide-1',title:'t',city:'c',cover_url:null,summary:'s'}})
    rpcMock.mockResolvedValueOnce({data:{version:2,content},error:null})
    const result=await StudioEditGuidePage({params:Promise.resolve({locale:'en',id:'guide-1'})}) as ReactElement<{children:ReactElement<{initialContent:unknown}>[]}>
    expect(result.props.children[1].props.initialContent).toEqual(content)
  })

  it('gates on an active creator, sending anyone else to onboarding', async () => {
    expect(creatorPageGateMock).not.toHaveBeenCalled()
    maybeSingleMock.mockResolvedValue({ data: { id: 'guide-1', title: 't', city: 'c', cover_url: null, summary: 's' } })

    await StudioEditGuidePage({ params: Promise.resolve({ locale: 'en', id: 'guide-1' }) })

    expect(creatorPageGateMock).toHaveBeenCalledWith(expect.anything(), 'en', 'creator')
  })
})
