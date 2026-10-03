// @vitest-environment jsdom
import { describe, it, expect, vi, afterEach } from 'vitest'
import { render, screen, cleanup } from '@testing-library/react'

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
  DnaReviewForm: () => <div data-testid="step-review" />,
}))
vi.mock('@/components/onboarding/ReadBack', () => ({
  ReadBack: () => <div data-testid="step-readback" />,
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
  it("renders readback for initialStep='done'", () => {
    render(<WizardClient {...base()} initialStep="done" final={dna} />)
    expect(screen.getByTestId('step-readback')).toBeTruthy()
  })
  it("renders a wait message for initialStep='wait'", () => {
    render(<WizardClient {...base()} initialStep="wait" />)
    expect(screen.getByText(/setting up/i)).toBeTruthy() // wait copy present
  })
})
