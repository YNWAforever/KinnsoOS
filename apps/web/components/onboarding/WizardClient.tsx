'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { createSupabaseBrowserClient } from '@/lib/supabase/client'
import type { Dna } from '@kinnso/scan'
import type { Messages } from '@/lib/i18n/messages/en'
import type { Locale } from '@/lib/i18n/config'
import type { Step } from '@/lib/onboarding/resumeRoute'
import type { Platform } from '@/lib/onboarding/validateHandle'
import type { InitialHandle } from '@/components/onboarding/HandlesStep'
import { HandlesStep } from './HandlesStep'
import { WelcomeStep } from './WelcomeStep'
import { LiveProgress } from './LiveProgress'
import { DnaReviewForm } from './DnaReviewForm'
import { ReadBack } from './ReadBack'

export interface WizardClientProps {
  creatorId: string
  locale: Locale
  initialStep: Step
  handles: InitialHandle[]
  latestJobId: string | null
  draft: Dna | null
  final: Dna | null
  thin: boolean
  messages: Pick<Messages, 'onboarding' | 'dna'>
}

/** Platforms to render in live progress: the saved handles' platforms (else all three). */
function progressPlatforms(handles: InitialHandle[]): Platform[] {
  const fromHandles = handles.map((h) => h.platform)
  return fromHandles.length > 0 ? fromHandles : ['instagram', 'youtube', 'threads']
}

export function WizardClient(props: WizardClientProps) {
  const { creatorId, locale, handles, latestJobId, draft, final, thin, messages } = props
  const router = useRouter()
  const [step, setStep] = useState<Step>(props.initialStep)
  // Client-fetched fallback for the AI draft. The server snapshot is the primary
  // source, but `router.refresh()` can lag or serve a cached snapshot under the
  // App Router — so `effectiveDraft` lets the review step recover on its own.
  const [clientDraft, setClientDraft] = useState<Dna | null>(null)
  const effectiveDraft = draft ?? clientDraft

  const onb = messages.onboarding

  // One-time welcome for brand-new creators; the dismissed flag is persisted
  // client-side so it doesn't reappear on refresh.
  const [welcomed, setWelcomed] = useState(false)
  useEffect(() => {
    // One-time client read of the persisted dismiss flag. setState-on-mount is
    // intentional (it can't run during SSR), and starting from `false` on both
    // server and client avoids a hydration mismatch.
    try {
      if (window.localStorage?.getItem('kinnso_welcome_seen') === '1') {
        // eslint-disable-next-line react-hooks/set-state-in-effect
        setWelcomed(true)
      }
    } catch {
      // localStorage unavailable (private mode / test env) — just show the welcome.
    }
  }, [])

  // Resilience: once we're on the review step but no draft has arrived, pull it
  // directly from creator_dna (owner RLS) until it appears. Without this, a
  // missed/stale refresh after a successful scan strands the creator on the
  // "analysis ready" line forever — the failure the e2e onboarding journey hit.
  useEffect(() => {
    if (step !== 'review' || effectiveDraft) return
    let cancelled = false
    const supabase = createSupabaseBrowserClient()
    const pull = async (): Promise<boolean> => {
      const { data } = await supabase
        .from('creator_dna')
        .select('ai_draft')
        .eq('creator_id', creatorId)
        .maybeSingle()
      const d = (data?.ai_draft ?? null) as Dna | null
      if (d && !cancelled) {
        setClientDraft(d)
        return true
      }
      return false
    }
    void pull()
    const timer = setInterval(() => {
      void pull().then((got) => {
        if (got) clearInterval(timer)
      })
    }, 1500)
    return () => {
      cancelled = true
      clearInterval(timer)
    }
  }, [step, effectiveDraft, creatorId])

  // 'wait' — creators row not visible yet (trigger lag); a manual refresh recovers.
  if (step === 'wait') {
    return (
      <section className="space-y-3 text-center">
        <p className="text-sm text-kinnso-ink/70">Setting up your account…</p>
        <button
          type="button"
          className="text-sm underline"
          onClick={() => router.refresh()}
        >
          {onb.progressStep.continue}
        </button>
      </section>
    )
  }

  if (step === 'handles') {
    // Brand-new creators (no saved handles yet) get a one-time welcome first.
    if (handles.length === 0 && !welcomed) {
      return (
        <WelcomeStep
          t={onb.welcomeStep}
          onStart={() => {
            try {
              window.localStorage.setItem('kinnso_welcome_seen', '1')
            } catch {
              // ignore storage failures (private mode, etc.)
            }
            setWelcomed(true)
          }}
        />
      )
    }
    return (
      <HandlesStep
        creatorId={creatorId}
        initialHandles={handles}
        t={onb.handlesStep}
        onRun={() => setStep('progress')}
      />
    )
  }

  if (step === 'progress' || step === 'retry') {
    return (
      <LiveProgress
        creatorId={creatorId}
        jobId={latestJobId}
        platforms={progressPlatforms(handles)}
        t={onb.progressStep}
        onReady={() => {
          // Pull fresh server state (ai_draft now present) and switch to review.
          router.refresh()
          setStep('review')
        }}
      />
    )
  }

  if (step === 'review') {
    if (!effectiveDraft) {
      // Draft not on the server snapshot yet — the effect above is pulling it
      // from creator_dna; show the "analysis ready" line until it arrives.
      return (
        <section className="text-center text-sm text-kinnso-ink/70">
          {onb.progressStep.phaseReady}
        </section>
      )
    }
    return (
      <DnaReviewForm
        creatorId={creatorId}
        draft={effectiveDraft}
        thin={thin}
        t={messages.dna}
        onPublished={() => {
          router.refresh()
          setStep('done')
        }}
      />
    )
  }

  // step === 'done'
  return (
    <ReadBack
      dna={final ?? effectiveDraft ?? emptyDna()}
      t={messages.dna}
      dashboardHref={`/${locale}/studio`}
      signOutHref={`/${locale}/auth/sign-out`}
      signOutLabel={onb.signOut}
    />
  )
}

function emptyDna(): Dna {
  return { bio: '', niches: [], content_pillars: [], tone: [], audience: {}, platforms: [], languages: [] }
}
