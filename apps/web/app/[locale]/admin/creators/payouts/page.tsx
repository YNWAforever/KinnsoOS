import { notFound } from 'next/navigation'
import { isLocale, type Locale, LOCALES } from '@/lib/i18n/config'
import { getDictionary } from '@/lib/i18n/dictionaries'
import { createSupabaseServerClient } from '@/lib/supabase/server'
import { requireOpsPage } from '@/lib/admin/guard'
import { getSettlementsQueue } from '@/lib/admin/creators-queries'
import { isSettlementStatus, isSettlementSource } from '@/lib/admin/creators-validation'
import { getPayoutBatches } from '@/lib/admin/payout-batches-queries'
import { setSettlementStatus } from '@/lib/admin/creators-actions'
import { createPayoutBatch, markPayoutBatchPaid, cancelPayoutBatch } from '@/lib/admin/payout-batches-actions'
import { CreatorPayoutsView } from '@/components/kinnso/admin/creators/CreatorPayoutsView'
import { CreatorPayoutBatchesView } from '@/components/kinnso/admin/creators/CreatorPayoutBatchesView'

export function generateStaticParams() {
  return LOCALES.map((locale) => ({ locale }))
}

type Search = { status?: string; source?: string }

export default async function CreatorsPayoutsPage({
  params, searchParams,
}: { params: Promise<{ locale: string }>; searchParams: Promise<Search> }) {
  const { locale } = await params
  if (!isLocale(locale)) notFound()
  const loc = locale as Locale
  const supabase = await createSupabaseServerClient()
  await requireOpsPage(supabase, loc)
  const messages = await getDictionary(loc)
  const sp = await searchParams
  const status = sp.status && isSettlementStatus(sp.status) ? sp.status : undefined
  const source = sp.source && isSettlementSource(sp.source) ? sp.source : undefined
  const queue = await getSettlementsQueue(supabase, { status, source })
  const batches = await getPayoutBatches(supabase)
  return (
    <>
      <CreatorPayoutsView
        t={messages.creators}
        locale={loc}
        queue={queue}
        status={status}
        source={source}
        action={setSettlementStatus}
      />
      <CreatorPayoutBatchesView
        t={messages.creators}
        locale={loc}
        batches={batches}
        createAction={createPayoutBatch}
        markPaidAction={markPayoutBatchPaid}
        cancelAction={cancelPayoutBatch}
      />
    </>
  )
}
