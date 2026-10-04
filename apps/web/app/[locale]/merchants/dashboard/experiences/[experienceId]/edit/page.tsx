import type { Metadata } from 'next'
import { notFound } from 'next/navigation'
import { isLocale, type Locale } from '@/lib/i18n/config'
import { getDictionary } from '@/lib/i18n/dictionaries'
import { createSupabaseServerClient } from '@/lib/supabase/server'
import { requireMerchantPage } from '@/lib/admin/guard'
import { getMyExperience } from '@/lib/experiences/queries'
import { noindexMetadata } from '@/lib/seo/metadata'
import { ExperienceForm } from '@/components/kinnso/pages/ExperienceForm'

export const metadata: Metadata = noindexMetadata()

export default async function EditExperiencePage({ params }: {
  params: Promise<{ locale: string; experienceId: string }>
}) {
  const { locale, experienceId } = await params
  if (!isLocale(locale)) notFound()
  const loc = locale as Locale
  const supabase = await createSupabaseServerClient()
  const { merchantId } = await requireMerchantPage(supabase, loc)
  const existing = await getMyExperience(supabase, merchantId, experienceId)
  if (!existing) notFound()
  const messages = await getDictionary(loc)
  return <ExperienceForm locale={loc} t={messages.merchantDashboard} existing={existing} />
}
