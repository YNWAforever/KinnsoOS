import { notFound } from 'next/navigation'
import { isLocale, type Locale, LOCALES } from '@/lib/i18n/config'
import { getDictionary } from '@/lib/i18n/dictionaries'
import { createSupabaseServerClient } from '@/lib/supabase/server'
import { StudioScanView } from '@/components/kinnso/pages/StudioScanView'
import { StudioOnboardingPrompt } from '@/components/kinnso/StudioOnboardingPrompt'
import { getCreator, sampleDna } from '@/lib/creator-mock'
import { buildStudioIdentity, buildDemoIdentity, type HandleRow } from '@/lib/studio/identity'
import { DnaSchema, type Dna, type Platform } from '@kinnso/scan'

export function generateStaticParams() {
  return LOCALES.map((locale) => ({ locale }))
}

/**
 * /[locale]/studio/scan — Studio Scan + DNA report (ungated this slice).
 *
 * - ANON → sample demo (mock identity + sampleDna + mock metrics; fake-scan intro),
 *   shown behind an explicit `demoBanner` so it is never mistaken for live data.
 * - LOGGED-IN + valid `creator_dna.final` → REAL identity + REAL qualitative DNA
 *   ONLY (isSample=false). The fabricated numeric metric sections are demo-only and
 *   do NOT render here — we have no real metrics pipeline yet.
 * - LOGGED-IN + no/invalid `final` → onboarding prompt (CTA → /[locale]/creator).
 *
 * The mock `ExtendedCreator` ('maywanders') is still passed as `metrics` to satisfy
 * the demo render path; in real mode the view ignores it (all metric sections are
 * gated to demo mode).
 */
export default async function StudioScanPage({
  params,
}: {
  params: Promise<{ locale: string }>
}) {
  const { locale } = await params
  if (!isLocale(locale)) notFound()
  const messages = await getDictionary(locale as Locale)
  const t = messages.studio

  const supabase = await createSupabaseServerClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  const metrics = getCreator('maywanders')!

  // ── ANON → unchanged mock demo ──────────────────────────────
  if (!user) {
    return (
      <StudioScanView
        locale={locale as Locale}
        mode="demo"
        identity={buildDemoIdentity(metrics, new Date().toISOString())}
        dna={sampleDna}
        metrics={metrics}
        isSample={false}
        t={t}
      />
    )
  }

  // ── LOGGED-IN → real identity + real DNA (RLS owner-scoped reads) ──
  const { data: creatorRow } = await supabase
    .from('creators')
    .select('display_name')
    .eq('id', user.id)
    .single()

  const { data: handleRows } = await supabase
    .from('creator_social_handles')
    .select('platform, handle, url')
    .eq('creator_id', user.id)
  const handles: HandleRow[] = (handleRows ?? []).map((h) => ({
    platform: h.platform as Platform,
    handle: h.handle,
    url: h.url,
  }))

  const { data: dnaRow } = await supabase
    .from('creator_dna')
    .select('final, updated_at')
    .eq('creator_id', user.id)
    .single()

  // `final` is untrusted jsonb — validate before rendering. Covers null,
  // mid-onboarding (only ai_draft), and a missing creator_dna row.
  const parsed = DnaSchema.safeParse(dnaRow?.final)
  if (!parsed.success) {
    return <StudioOnboardingPrompt t={t} locale={locale} />
  }
  const dna: Dna = parsed.data
  const updatedAt = (dnaRow?.updated_at as string | null) ?? new Date().toISOString()

  return (
    <StudioScanView
      locale={locale as Locale}
      mode="real"
      identity={buildStudioIdentity(
        { display_name: creatorRow?.display_name ?? null },
        handles,
        dna,
        updatedAt,
      )}
      dna={dna}
      metrics={metrics}
      isSample={false}
      t={t}
    />
  )
}
