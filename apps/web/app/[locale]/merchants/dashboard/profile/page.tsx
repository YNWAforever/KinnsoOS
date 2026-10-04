import type { Metadata } from 'next'
import { notFound } from 'next/navigation'
import { isLocale, type Locale } from '@/lib/i18n/config'
import { getDictionary } from '@/lib/i18n/dictionaries'
import { createSupabaseServerClient } from '@/lib/supabase/server'
import { requireMerchantPage } from '@/lib/admin/guard'
import { getMyMerchantProfile } from '@/lib/merchants/profile-queries'
import { noindexMetadata } from '@/lib/seo/metadata'
import { MerchantProfileView } from '@/components/kinnso/pages/MerchantProfileView'

export const metadata: Metadata = noindexMetadata()

export default async function MerchantProfilePage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params
  if (!isLocale(locale)) notFound()
  const loc = locale as Locale
  const supabase = await createSupabaseServerClient()
  const { user } = await requireMerchantPage(supabase, loc)
  const profile = await getMyMerchantProfile(supabase, user.id)
  if (!profile) notFound()
  const messages = await getDictionary(loc)
  return <MerchantProfileView locale={loc} t={messages.merchantDashboard} profile={profile} />
}
