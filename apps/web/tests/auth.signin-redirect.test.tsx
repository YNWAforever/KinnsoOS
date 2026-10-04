import { beforeEach, describe, expect, it, vi } from 'vitest'
import { redirect } from 'next/navigation'

const state = vi.hoisted(() => ({ user: null as { id: string } | null }))

vi.mock('next/navigation', () => ({ redirect: vi.fn(), notFound: vi.fn() }))
vi.mock('@/lib/supabase/server', () => ({
  createSupabaseServerClient: async () => ({
    auth: { getUser: async () => ({ data: { user: state.user } }) },
  }),
}))

import SignInPage from '@/app/[locale]/sign-in/page'

beforeEach(() => {
  state.user = null
  vi.clearAllMocks()
})

describe('/[locale]/sign-in host', () => {
  it('redirects an already-signed-in user to the role-aware hub /studio', async () => {
    state.user = { id: 'u1' }
    await SignInPage({ params: Promise.resolve({ locale: 'en' }), searchParams: Promise.resolve({}) })
    expect(redirect).toHaveBeenCalledWith('/en/studio')
  })
})
