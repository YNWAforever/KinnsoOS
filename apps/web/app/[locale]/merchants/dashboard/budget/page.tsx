import type { Metadata } from 'next'
import { notFound } from 'next/navigation'
import { isLocale, type Locale } from '@/lib/i18n/config'
import { getDictionary } from '@/lib/i18n/dictionaries'
import { createSupabaseServerClient } from '@/lib/supabase/server'
import { requireMerchantPage } from '@/lib/admin/guard'
import { noindexMetadata } from '@/lib/seo/metadata'
import { getMerchantBudget } from '@/lib/merchants/budget-queries'
import { MerchantBudgetView } from '@/components/kinnso/pages/MerchantBudgetView'

export const metadata: Metadata = noindexMetadata()

export default async function MerchantBudgetPage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params
  if (!isLocale(locale)) notFound()
  const loc = locale as Locale
  const supabase = await createSupabaseServerClient()
  const { merchantId } = await requireMerchantPage(supabase, loc)
  const messages = await getDictionary(loc)
  const budget = await getMerchantBudget(supabase, merchantId)
  return <MerchantBudgetView t={messages.merchantDashboard} budget={budget} />
}
