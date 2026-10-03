import { notFound } from 'next/navigation'
import { MissionPostWizard } from '@/components/kinnso/pages/MissionPostWizard'
import { requireMerchantPage } from '@/lib/admin/guard'
import { isLocale, type Locale, LOCALES } from '@/lib/i18n/config'
import { getDictionary } from '@/lib/i18n/dictionaries'
import { createMissionAction } from '@/lib/missions/actions'
import type { MissionDraftInput } from '@/lib/missions/types'
import { createSupabaseServerClient } from '@/lib/supabase/server'

export function generateStaticParams() {
  return LOCALES.map((locale) => ({ locale }))
}

export default async function MerchantPostPage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params
  if (!isLocale(locale)) notFound()
  const messages = await getDictionary(locale as Locale)

  // This page had no gate of its own: only `isLocale`. The proxy keeps anonymous
  // visitors out of the /merchants/dashboard prefix and createMissionAction
  // re-derives authority server-side, so this was never an escalation — but any
  // signed-in traveller or creator was served the merchant brief wizard and only
  // discovered it was not for them at submit time.
  const supabase = await createSupabaseServerClient()
  await requireMerchantPage(supabase, locale as Locale)

  async function submitMission(input: MissionDraftInput, opts: { publish: boolean }) {
    'use server'
    return createMissionAction(input, { publish: opts.publish, locale })
  }

  return <MissionPostWizard locale={locale} t={messages.missions} onSubmit={submitMission} />
}
