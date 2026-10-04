import { notFound } from 'next/navigation'
import { isLocale, type Locale, LOCALES } from '@/lib/i18n/config'
import { getDictionary } from '@/lib/i18n/dictionaries'
import { createSupabaseServerClient } from '@/lib/supabase/server'
import { requireOpsPage } from '@/lib/admin/guard'
import { listMerchantsDirectory } from '@/lib/admin/merchants-queries'
import { normalizeMerchantDirectoryParams } from '@/lib/admin/merchants-validation'
import { MerchantsDirectoryView } from '@/components/kinnso/admin/merchants/MerchantsDirectoryView'
import { setMerchantStatus, setMerchantTier, addMerchantNote, bulkSetMerchantStatus } from '@/lib/admin/merchants-actions'

export function generateStaticParams() {
  return LOCALES.map((locale) => ({ locale }))
}

type Search = { q?: string; status?: string; tier?: string; cursor_at?: string; cursor_id?: string }

export default async function MerchantsDirectoryPage({
  params, searchParams,
}: { params: Promise<{ locale: string }>; searchParams: Promise<Search> }) {
  const { locale } = await params
  if (!isLocale(locale)) notFound()
  const loc = locale as Locale
  const supabase = await createSupabaseServerClient()
  await requireOpsPage(supabase, loc)
  const messages = await getDictionary(loc)
  const sp = await searchParams
  const filters = normalizeMerchantDirectoryParams(sp)
  const cursor = sp.cursor_at && sp.cursor_id ? { createdAt: sp.cursor_at, id: sp.cursor_id } : null
  const directory = await listMerchantsDirectory(supabase, { ...filters, cursor, limit: 25 })
  return (
    <MerchantsDirectoryView
      t={messages.merchantsOps}
      locale={loc}
      directory={directory}
      onSetStatus={setMerchantStatus}
      onSetTier={setMerchantTier}
      onAddNote={addMerchantNote}
      onBulkSetStatus={bulkSetMerchantStatus}
    />
  )
}
