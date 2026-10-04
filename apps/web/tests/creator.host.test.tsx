// @vitest-environment jsdom
import { cleanup, render } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

afterEach(cleanup)

const { wizardPropsMock } = vi.hoisted(() => ({
  wizardPropsMock: vi.fn(),
}))

vi.mock('next/navigation', () => ({
  notFound: () => { throw new Error('NEXT_NOT_FOUND') },
  redirect: (path: string) => { throw new Error(`NEXT_REDIRECT:${path}`) },
}))

vi.mock('@/lib/onboarding/resumeRoute', () => ({
  resumeStep: () => 'handles',
}))

vi.mock('@/components/onboarding/WizardClient', () => ({
  WizardClient: (props: unknown) => {
    wizardPropsMock(props)
    return <div data-testid="wizard" />
  },
}))

vi.mock('@/lib/supabase/server', () => ({
  createSupabaseServerClient: async () => ({
    auth: {
      getUser: async () => ({ data: { user: { id: 'creator-1' } } }),
    },
    from: (table: string) => {
      if (table === 'creators') {
        return {
          select: () => ({
            eq: () => ({
              single: async () => ({ data: { id: 'creator-1', status: 'pending' } }),
            }),
          }),
        }
      }
      if (table === 'creator_social_handles') {
        return {
          select: () => ({
            eq: async () => ({ data: [] }),
          }),
        }
      }
      if (table === 'creator_scan_jobs') {
        return {
          select: () => ({
            eq: () => ({
              order: () => ({
                limit: async () => ({ data: [] }),
              }),
            }),
          }),
        }
      }
      throw new Error(`Unexpected table: ${table}`)
    },
  }),
}))

import CreatorPage from '@/app/[locale]/creator/page'

beforeEach(() => {
  wizardPropsMock.mockClear()
})

describe('/[locale]/creator host', () => {
  it('passes only serializable onboarding messages to the client wizard', async () => {
    const ui = await CreatorPage({ params: Promise.resolve({ locale: 'en' }) })
    render(ui)

    const props = wizardPropsMock.mock.calls[0]?.[0] as {
      messages: Record<string, unknown>
    }

    expect(Object.keys(props.messages).sort()).toEqual(['dna', 'onboarding'])
    expect(containsFunction(props.messages)).toBe(false)
  })
})

function containsFunction(value: unknown): boolean {
  if (typeof value === 'function') return true
  if (!value || typeof value !== 'object') return false
  return Object.values(value).some(containsFunction)
}
