import { notFound } from 'next/navigation'
import { MerchantApplicationsView } from '@/components/kinnso/admin/merchants/MerchantApplicationsView'
import { requireOpsPage } from '@/lib/admin/guard'
import { approveMerchantApplicationAction, rejectMerchantApplicationAction } from '@/lib/admin/merchant-applications-actions'
import { listPendingMerchantApplications, listDecidedMerchantApplications } from '@/lib/admin/merchant-applications-queries'
import { isLocale, type Locale, LOCALES } from '@/lib/i18n/config'
import { getDictionary } from '@/lib/i18n/dictionaries'
import { createSupabaseServerClient } from '@/lib/supabase/server'

export function generateStaticParams() {
  return LOCALES.map((locale) => ({ locale }))
}

export default async function AdminMerchantApplicationsPage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params
  if (!isLocale(locale)) notFound()
  const loc = locale as Locale
  const supabase = await createSupabaseServerClient()
  await requireOpsPage(supabase, loc)
  const messages = await getDictionary(loc)
  const [pending, decided] = await Promise.all([
    listPendingMerchantApplications(supabase),
    listDecidedMerchantApplications(supabase),
  ])

  async function onApprove(locale: Locale, id: string, reason: string) {
    'use server'
    return approveMerchantApplicationAction(locale, id, reason)
  }
  async function onReject(locale: Locale, id: string, reason: string) {
    'use server'
    return rejectMerchantApplicationAction(locale, id, reason)
  }

  return (
    <MerchantApplicationsView
      t={messages.merchantApplicationsOps}
      tabsT={messages.merchantsOps}
      locale={loc}
      pending={pending}
      decided={decided}
      onApprove={onApprove}
      onReject={onReject}
    />
  )
}
