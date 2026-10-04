import type { Metadata } from 'next'
import { notFound } from 'next/navigation'
import { isLocale, type Locale } from '@/lib/i18n/config'
import { getDictionary } from '@/lib/i18n/dictionaries'
import { createSupabaseServerClient } from '@/lib/supabase/server'
import { requireMerchantPage } from '@/lib/admin/guard'
import { listMyExperiences } from '@/lib/experiences/queries'
import { noindexMetadata } from '@/lib/seo/metadata'
import { MerchantExperiencesView } from '@/components/kinnso/pages/MerchantExperiencesView'

export const metadata: Metadata = noindexMetadata()

export default async function MerchantExperiencesPage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params
  if (!isLocale(locale)) notFound()
  const loc = locale as Locale
  const supabase = await createSupabaseServerClient()
  const { merchantId } = await requireMerchantPage(supabase, loc)
  const experiences = await listMyExperiences(supabase, merchantId)
  const messages = await getDictionary(loc)
  return <MerchantExperiencesView locale={loc} t={messages.merchantDashboard} experiences={experiences} />
}
