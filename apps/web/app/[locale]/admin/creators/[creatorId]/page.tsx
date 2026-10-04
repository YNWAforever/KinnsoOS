import { notFound } from 'next/navigation'
import { isLocale, type Locale } from '@/lib/i18n/config'
import { getDictionary } from '@/lib/i18n/dictionaries'
import { createSupabaseServerClient } from '@/lib/supabase/server'
import { requireOpsPage } from '@/lib/admin/guard'
import { getCreatorDetail } from '@/lib/admin/creators-queries'
import { listAudit } from '@/lib/admin/audit'
import { CreatorDetailView } from '@/components/kinnso/admin/creators/CreatorDetailView'
import { setCreatorStatus, reinstateCreator, setCreatorVerified, setCreatorListed, addCreatorNote } from '@/lib/admin/creators-actions'

export default async function CreatorDetailPage({
  params,
}: { params: Promise<{ locale: string; creatorId: string }> }) {
  const { locale, creatorId } = await params
  if (!isLocale(locale)) notFound()
  const loc = locale as Locale
  const supabase = await createSupabaseServerClient()
  await requireOpsPage(supabase, loc)
  const messages = await getDictionary(loc)
  const detail = await getCreatorDetail(supabase, creatorId)
  if (!detail) notFound()
  const audit = await listAudit(supabase, 'creator', creatorId)
  return (
    <CreatorDetailView
      t={messages.creators}
      locale={loc}
      detail={detail}
      audit={audit}
      actions={{ setCreatorStatus, reinstateCreator, setCreatorVerified, setCreatorListed, addCreatorNote }}
    />
  )
}
