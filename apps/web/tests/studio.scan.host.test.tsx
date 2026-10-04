// @vitest-environment jsdom
import { describe, it, expect, afterEach, beforeEach, vi } from 'vitest'
import { render, screen, cleanup } from '@testing-library/react'

afterEach(cleanup)

// Mutable mock state, read fresh on each createSupabaseServerClient() call.
const state = vi.hoisted(() => ({
  user: null as { id: string } | null,
  rows: {} as Record<string, unknown>,
}))

vi.mock('next/navigation', () => ({ useRouter: () => ({ push: vi.fn() }), notFound: vi.fn() }))
vi.mock('@/lib/supabase/server', () => ({
  createSupabaseServerClient: async () => ({
    auth: { getUser: async () => ({ data: { user: state.user } }) },
    from: (table: string) => {
      const data = state.rows[table] ?? null
      const builder = {
        select: () => builder,
        eq: () => builder,
        order: () => builder,
        limit: () => builder,
        single: async () => ({ data }),
        then: (res: (v: { data: unknown }) => unknown) => Promise.resolve({ data }).then(res),
      }
      return builder
    },
  }),
}))

import StudioScanPage from '@/app/[locale]/studio/scan/page'
import { sampleDna } from '@/lib/creator-mock'
import en from '@/lib/i18n/messages/en'

beforeEach(() => {
  state.user = null
  state.rows = {}
})

describe('/[locale]/studio/scan host', () => {
  it('anon → sample demo report, clearly labelled with the demo banner', async () => {
    state.user = null
    const ui = await StudioScanPage({ params: Promise.resolve({ locale: 'en' }) })
    render(ui)
    expect(screen.getByText(en.studio.reportReadyHeading)).toBeTruthy()
    expect(screen.getByText(en.studio.dnaCoreHeading)).toBeTruthy()
    expect(screen.getByText(en.studio.demoBanner)).toBeTruthy()
    expect(screen.getByRole('button', { name: en.studio.publishProfile })).toBeTruthy()
  })

  it('logged-in + valid final DNA → real DNA core only (no sample framing, no fabricated metrics)', async () => {
    state.user = { id: 'u1' }
    state.rows = {
      creators: { display_name: 'May Wong' },
      creator_social_handles: [{ platform: 'instagram', handle: 'maygram', url: null }],
      creator_dna: { final: sampleDna, updated_at: '2026-06-01T00:00:00Z' },
    }
    const ui = await StudioScanPage({ params: Promise.resolve({ locale: 'en' }) })
    render(ui)
    expect(screen.getByText('May Wong')).toBeTruthy()
    expect(screen.getByText('@maygram')).toBeTruthy()
    // sampleDna.bio is unique prose rendered only by DnaCorePanel — the real DNA.
    expect(screen.getByText(sampleDna.bio)).toBeTruthy()
    // Real mode is honest: no "sample" framing, no demo banner, no maywanders metrics.
    expect(screen.queryByText(en.studio.sampleNote)).toBeNull()
    expect(screen.queryByText(en.studio.demoBanner)).toBeNull()
    expect(screen.queryByText(en.studio.whatYouCreate)).toBeNull()
  })

  it('logged-in + no/invalid final DNA → onboarding prompt', async () => {
    state.user = { id: 'u1' }
    state.rows = {
      creators: { display_name: null },
      creator_social_handles: [],
      creator_dna: { final: null, updated_at: null },
    }
    const ui = await StudioScanPage({ params: Promise.resolve({ locale: 'en' }) })
    render(ui)
    expect(screen.getByText(en.studio.noDnaHeading)).toBeTruthy()
    expect(screen.getByRole('link', { name: en.studio.noDnaCta }).getAttribute('href')).toBe('/en/creator')
  })
})
