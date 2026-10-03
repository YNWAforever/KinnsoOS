import type { Metadata } from 'next'
import { redirect, notFound } from 'next/navigation'
import { isLocale, type Locale } from '@/lib/i18n/config'
import { getDictionary } from '@/lib/i18n/dictionaries'
import { createSupabaseServerClient } from '@/lib/supabase/server'
import { resumeStep, type CreatorStatus, type JobSnapshot } from '@/lib/onboarding/resumeRoute'
import { isThin, type JobProgress } from '@/lib/onboarding/progress'
import type { Platform } from '@/lib/onboarding/validateHandle'
import type { InitialHandle } from '@/components/onboarding/HandlesStep'
import { WizardClient } from '@/components/onboarding/WizardClient'
import type { Dna } from '@kinnso/scan'
import { noindexMetadata } from '@/lib/seo/metadata'

export const metadata: Metadata = noindexMetadata()

/**
 * /[locale]/creator — the onboarding wizard host.
 *
 * Gated by proxy.ts (Plan 1b): unauthenticated users never reach this page.
 * We read the live creator state server-side (RLS owner reads), compute the
 * resume step, load the DNA draft/final when needed, and delegate rendering to
 * the WizardClient. Standalone profile editing + public /c/[handle] are SP6.
 */
export default async function CreatorPage({
  params,
}: {
  params: Promise<{ locale: string }>
}) {
  const { locale } = await params
  if (!isLocale(locale)) notFound()
  const messages = await getDictionary(locale as Locale)

  const supabase = await createSupabaseServerClient()

  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) redirect(`/${locale}/sign-in`)

  // creators row (owner select). May be null briefly right after sign-up (trigger lag).
  const { data: creator } = await supabase
    .from('creators')
    .select('id, status')
    .eq('id', user.id)
    .single()

  // Saved handles (owner select).
  const { data: handleRows } = await supabase
    .from('creator_social_handles')
    .select('platform, handle')
    .eq('creator_id', user.id)
  const handles: InitialHandle[] = (handleRows ?? []).map((h) => ({
    platform: h.platform as Platform,
    handle: h.handle,
  }))

  // Latest scan job (owner select; newest first).
  const { data: jobRows } = await supabase
    .from('creator_scan_jobs')
    .select('id, status, progress')
    .eq('creator_id', user.id)
    .order('created_at', { ascending: false })
    .limit(1)
  const latestJobRaw = jobRows?.[0] ?? null
  const latestJob: JobSnapshot | null = latestJobRaw
    ? { id: latestJobRaw.id, status: latestJobRaw.status as JobSnapshot['status'] }
    : null
  const latestProgress = (latestJobRaw?.progress ?? null) as JobProgress | null

  const creatorStatus = (creator?.status ?? null) as CreatorStatus | null
  const initialStep = resumeStep(creatorStatus, latestJob, handles.length)

  // DNA draft/final — only fetched when the step needs it.
  let draft: Dna | null = null
  let final: Dna | null = null
  if (initialStep === 'review' || initialStep === 'done') {
    const { data: dnaRow } = await supabase
      .from('creator_dna')
      .select('ai_draft, final')
      .eq('creator_id', user.id)
      .single()
    draft = (dnaRow?.ai_draft ?? null) as Dna | null
    final = (dnaRow?.final ?? null) as Dna | null
  }

  return (
    <main className="flex min-h-screen flex-col items-center justify-start gap-6 p-6 pt-16">
      <h1 className="text-2xl font-bold">{messages.onboarding.title}</h1>
      <WizardClient
        creatorId={user.id}
        locale={locale as Locale}
        initialStep={initialStep}
        handles={handles}
        latestJobId={latestJob?.id ?? null}
        draft={draft}
        final={final}
        thin={isThin(latestProgress)}
        messages={{ onboarding: messages.onboarding, dna: messages.dna }}
      />
    </main>
  )
}
