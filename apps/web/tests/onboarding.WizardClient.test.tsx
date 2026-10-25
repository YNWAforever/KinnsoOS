// @vitest-environment jsdom
import { describe, it, expect, vi, afterEach } from 'vitest'
import { render, screen, cleanup, fireEvent } from '@testing-library/react'

afterEach(cleanup)
import type { Dna } from '@kinnso/scan'

// next/navigation router stub
vi.mock('next/navigation', () => ({ useRouter: () => ({ refresh: vi.fn() }) }))
// Supabase browser client stub — backs the review step's client-side draft pull.
const { maybeSingleMock } = vi.hoisted(() => ({ maybeSingleMock: vi.fn() }))
vi.mock('@/lib/supabase/client', () => ({
  createSupabaseBrowserClient: () => ({
    from: () => ({ select: () => ({ eq: () => ({ maybeSingle: maybeSingleMock }) }) }),
  }),
}))
// Stub the leaf step components so this test only asserts ORCHESTRATION (which step renders).
vi.mock('@/components/onboarding/HandlesStep', () => ({
  HandlesStep: () => <div data-testid="step-handles" />,
}))
vi.mock('@/components/onboarding/WelcomeStep', () => ({
  WelcomeStep: () => <div data-testid="step-welcome" />,
}))
vi.mock('@/components/onboarding/LiveProgress', () => ({
  LiveProgress: () => <div data-testid="step-progress" />,
}))
vi.mock('@/components/onboarding/DnaReviewForm', () => ({
  DnaReviewForm: ({ draft, onPublished }: { draft: Dna; onPublished: (published: Dna) => void }) => (
    <button
      type="button"
      data-testid="step-review"
      onClick={() => onPublished({ ...draft, bio: 'E2E travel creator' })}
    >
      publish profile
    </button>
  ),
}))
vi.mock('@/components/onboarding/ReadBack', () => ({
  ReadBack: ({ dna }: { dna: Dna }) => <div data-testid="step-readback">{dna.bio}</div>,
}))

import { WizardClient } from '@/components/onboarding/WizardClient'
import en from '@/lib/i18n/messages/en'

const dna: Dna = {
  bio: 'b', niches: [], content_pillars: [], tone: [],
  audience: {}, platforms: [], languages: [],
}

function base() {
  return {
    creatorId: 'c1',
    locale: 'en' as const,
    handles: [],
    latestJobId: null,
    draft: null,
    final: null,
    thin: false,
    messages: en,
  }
}

describe('WizardClient initial step', () => {
  it("renders welcome for a brand-new creator (no handles yet)", () => {
    render(<WizardClient {...base()} initialStep="handles" />)
    expect(screen.getByTestId('step-welcome')).toBeTruthy()
  })
  it("renders handles for initialStep='handles' once handles exist", () => {
    render(
      <WizardClient
        {...base()}
        initialStep="handles"
        handles={[{ platform: 'instagram', handle: 'x' }]}
      />,
    )
    expect(screen.getByTestId('step-handles')).toBeTruthy()
  })
  it("renders progress for initialStep='progress'", () => {
    render(<WizardClient {...base()} initialStep="progress" latestJobId="job-1" />)
    expect(screen.getByTestId('step-progress')).toBeTruthy()
  })
  it("renders progress for initialStep='retry'", () => {
    render(<WizardClient {...base()} initialStep="retry" latestJobId="job-1" />)
    expect(screen.getByTestId('step-progress')).toBeTruthy()
  })
  it("renders review for initialStep='review'", () => {
    render(<WizardClient {...base()} initialStep="review" draft={dna} />)
    expect(screen.getByTestId('step-review')).toBeTruthy()
  })
  it("recovers in review when the server draft is missing by fetching it client-side", async () => {
    // Reproduces the onboarding e2e failure: scan reached 'ready' but the refreshed
    // server snapshot carried no ai_draft, so the review step never appeared.
    maybeSingleMock.mockResolvedValue({ data: { ai_draft: dna }, error: null })
    render(<WizardClient {...base()} initialStep="review" draft={null} />)
    expect(await screen.findByTestId('step-review')).toBeTruthy()
    expect(maybeSingleMock).toHaveBeenCalled()
  })
  it("renders readback for initialStep='done' only when final DNA is published", () => {
    const published = { ...dna, bio: 'E2E travel creator' }
    render(<WizardClient {...base()} initialStep="done" final={published} draft={{ ...dna, bio: 'stale AI draft' }} />)
    expect(screen.getByTestId('step-readback').textContent).toBe('E2E travel creator')
    expect(screen.queryByText('stale AI draft')).toBeNull()
    expect(screen.queryByRole('status')).toBeNull()
  })

  it('shows the DNA just published, not the stale AI draft, before the server snapshot refreshes', () => {
    render(<WizardClient {...base()} initialStep="review" draft={{ ...dna, bio: 'stale AI draft' }} final={null} />)
    fireEvent.click(screen.getByTestId('step-review'))
    expect(screen.getByTestId('step-readback').textContent).toBe('E2E travel creator')
    expect(screen.queryByText('stale AI draft')).toBeNull()
    expect(screen.queryByRole('link', { name: en.dna.activatedGuideCta })).toBeNull()
  })

  it('does not claim a live profile or link back to studio home when activation has no published DNA', () => {
    render(<WizardClient {...base()} initialStep="done" final={null} draft={null} />)
    expect(screen.queryByTestId('step-readback')).toBeNull()
    expect(screen.getByRole('status').textContent).toContain(en.dna.activatedBody)
    const guide = screen.getByRole('link', { name: en.dna.activatedGuideCta })
    expect(guide.getAttribute('href')).toBe('/en/studio/guides/new')
    expect(screen.queryByRole('link', { name: en.dna.enterStudio })).toBeNull()
    expect(screen.queryByRole('link', { name: en.dna.activatedGuideCta })?.getAttribute('href')).not.toBe('/en/studio')
  })

  it('offers the unpublished draft for review and keeps setup when there is no draft', () => {
    const { unmount } = render(<WizardClient {...base()} initialStep="done" final={{} as Dna} draft={dna} />)
    expect(screen.queryByTestId('step-readback')).toBeNull()
    fireEvent.click(screen.getByRole('button', { name: en.dna.activatedReviewDraft }))
    expect(screen.getByTestId('step-review')).toBeTruthy()
    unmount()
    window.localStorage.removeItem('kinnso_welcome_seen')
    render(<WizardClient {...base()} initialStep="done" />)
    fireEvent.click(screen.getByRole('button', { name: en.dna.activatedContinueSetup }))
    expect(screen.getByTestId('step-welcome')).toBeTruthy()
  })
  it("renders a wait message for initialStep='wait'", () => {
    render(<WizardClient {...base()} initialStep="wait" />)
    expect(screen.getByText(/setting up/i)).toBeTruthy() // wait copy present
  })
})
