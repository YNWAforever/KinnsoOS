import { notFound } from 'next/navigation'
import { isLocale, type Locale } from '@/lib/i18n/config'
import { getDictionary } from '@/lib/i18n/dictionaries'
import { createSupabaseServerClient } from '@/lib/supabase/server'
import { requireOpsPage } from '@/lib/admin/guard'
import { getMerchantDetail, getMerchantBudgetOps } from '@/lib/admin/merchants-queries'
import { listAudit } from '@/lib/admin/audit'
import { MerchantDetailView } from '@/components/kinnso/admin/merchants/MerchantDetailView'
import { setMerchantStatus, setMerchantTier, addMerchantNote } from '@/lib/admin/merchants-actions'
import { creditMerchantBudget, setBudgetEnforcement } from '@/lib/admin/budget-actions'

export default async function MerchantDetailPage({
  params,
}: { params: Promise<{ locale: string; merchantId: string }> }) {
  const { locale, merchantId } = await params
  if (!isLocale(locale)) notFound()
  const loc = locale as Locale
  const supabase = await createSupabaseServerClient()
  await requireOpsPage(supabase, loc)
  const messages = await getDictionary(loc)
  const detail = await getMerchantDetail(supabase, merchantId)
  if (!detail) notFound()
  const audit = await listAudit(supabase, 'merchant', merchantId)
  const budget = await getMerchantBudgetOps(supabase, merchantId)
  return (
    <MerchantDetailView
      t={messages.merchantsOps}
      locale={loc}
      detail={detail}
      audit={audit}
      actions={{ setMerchantStatus, setMerchantTier, addMerchantNote }}
      budget={budget}
      budgetActions={{ credit: creditMerchantBudget, enforce: setBudgetEnforcement }}
    />
  )
}
