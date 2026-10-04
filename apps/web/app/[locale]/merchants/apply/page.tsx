import type { Metadata } from 'next'
import { notFound } from 'next/navigation'
import { isLocale, type Locale } from '@/lib/i18n/config'
import { getDictionary } from '@/lib/i18n/dictionaries'
import { createSupabaseServerClient } from '@/lib/supabase/server'
import { resolveViewerRole } from '@/lib/auth/viewer-role'
import { getMyMerchantApplication } from '@/lib/merchants/application-queries'
import { noindexMetadata } from '@/lib/seo/metadata'
import {
  MerchantApplyView,
  MerchantApplyAlreadyMerchantView,
  MerchantApplySignedOutView,
} from '@/components/kinnso/pages/MerchantApplyView'

export const metadata: Metadata = noindexMetadata()

export default async function MerchantApplyPage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params
  if (!isLocale(locale)) notFound()
  const loc = locale as Locale
  const dict = await getDictionary(loc)
  const supabase = await createSupabaseServerClient()
  const { data: { user } } = await supabase.auth.getUser()

  if (!user) {
    return <MerchantApplySignedOutView locale={loc} t={dict.merchantApply} />
  }

  const role = await resolveViewerRole(supabase)
  if (role === 'merchant') {
    return <MerchantApplyAlreadyMerchantView locale={loc} t={dict.merchantApply} />
  }

  const application = await getMyMerchantApplication(supabase, user.id)
  return <MerchantApplyView locale={loc} t={dict.merchantApply} application={application} />
}
