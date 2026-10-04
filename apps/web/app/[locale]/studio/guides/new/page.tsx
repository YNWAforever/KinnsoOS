import { notFound, redirect } from 'next/navigation'
import { requireCreatorPage } from '@/lib/admin/guard'
import { isLocale, type Locale } from '@/lib/i18n/config'
import { getDictionary } from '@/lib/i18n/dictionaries'
import { createSupabaseServerClient } from '@/lib/supabase/server'
import { GuideForm } from '@/components/kinnso/GuideForm'
import { createGuideAction } from '@/lib/guides/actions'
import type { GuideInput } from '@/lib/guides/types'

export default async function StudioNewGuidePage({
  params,
}: {
  params: Promise<{ locale: string }>
}) {
  const { locale } = await params
  if (!isLocale(locale)) notFound()
  const messages = await getDictionary(locale as Locale)

  const supabase = await createSupabaseServerClient()
  // Active-creator gate: every sign-up gets a blank `creators` row, so a
  // signed-in session alone is not a creator. `createGuideAction` enforces this
  // too — the gate only avoids showing a form that could never submit, and
  // sends a not-yet-active creator to onboarding rather than a dead end.
  await requireCreatorPage(supabase, locale as Locale, 'creator')

  async function submitGuide(input: GuideInput, opts: { publish: boolean }) {
    'use server'
    const result = await createGuideAction(input, { publish: opts.publish, locale })
    if (result.ok) redirect(`/${locale}/studio/guides`)
    return result
  }

  return <GuideForm t={messages.studioGuides} mode="new" backHref={`/${locale}/studio/guides`} onSubmit={submitGuide} />
}
