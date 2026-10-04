// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { cleanup, render, screen } from '@testing-library/react'

afterEach(cleanup)

const state = vi.hoisted(() => ({
  user: null as { id: string } | null,
}))

vi.mock('next/navigation', () => ({
  redirect: vi.fn(),
  notFound: vi.fn(),
  useRouter: () => ({ push: vi.fn(), refresh: vi.fn() }),
}))

vi.mock('@/lib/supabase/server', () => ({
  createSupabaseServerClient: async () => ({
    auth: {
      getUser: async () => ({ data: { user: state.user } }),
    },
  }),
}))

import { redirect } from 'next/navigation'
import SignUpPage from '@/app/[locale]/sign-up/page'
import en from '@/lib/i18n/messages/en'

beforeEach(() => {
  state.user = null
})

describe('/[locale]/sign-up host', () => {
  it('turns the sent state into a creator-onboarding handoff', async () => {
    const ui = await SignUpPage({
      params: Promise.resolve({ locale: 'en' }),
      searchParams: Promise.resolve({ sent: '1' }),
    })

    render(ui)

    expect(screen.queryByRole('form')).toBeNull()
    expect(screen.getByText('Check your email')).toBeTruthy()
    expect(
      screen.getByText('After confirming, Kinnso will take you to creator setup to connect Instagram, YouTube, or Threads.'),
    ).toBeTruthy()
    expect(screen.getByRole('link', { name: 'Sign in after confirming' }).getAttribute('href')).toBe('/en/sign-in')
    expect(screen.getByRole('link', { name: 'Use another email' }).getAttribute('href')).toBe('/en/sign-up')
    expect(document.querySelector('.k-auth-card')).toBeTruthy()
  })

  it('uses creator framing and a real terms link', async () => {
    state.user = null
    const ui = await SignUpPage({
      params: Promise.resolve({ locale: 'en' }),
      searchParams: Promise.resolve({}),
    })
    render(ui)
    expect(screen.getByRole('heading', { level: 1, name: en.auth.signUpCreatorTitle })).toBeTruthy()
    expect(screen.getByText(en.auth.signUpCreatorSubtitle)).toBeTruthy()
    expect(screen.getByRole('link', { name: en.auth.termsLink }).getAttribute('href')).toBe('/en/legal/creator-terms')
  })

  it('redirects an already-signed-in user to the role-aware hub /studio', async () => {
    state.user = { id: 'u1' }
    await SignUpPage({
      params: Promise.resolve({ locale: 'en' }),
      searchParams: Promise.resolve({}),
    })
    expect(redirect).toHaveBeenCalledWith('/en/studio')
  })
})
