import { notFound } from 'next/navigation'
import { isLocale, type Locale, LOCALES } from '@/lib/i18n/config'
import { getDictionary } from '@/lib/i18n/dictionaries'
import { createSupabaseServerClient } from '@/lib/supabase/server'
import { requireOpsPage } from '@/lib/admin/guard'
import { listCreatorsDirectory } from '@/lib/admin/creators-queries'
import { normalizeDirectoryParams } from '@/lib/admin/creators-validation'
import { CreatorsDirectoryView } from '@/components/kinnso/admin/creators/CreatorsDirectoryView'
import { setCreatorStatus, reinstateCreator, setCreatorVerified, addCreatorNote, bulkSetCreatorStatus } from '@/lib/admin/creators-actions'

export function generateStaticParams() {
  return LOCALES.map((locale) => ({ locale }))
}

type Search = { q?: string; status?: string; tier?: string; dna?: string; verified?: string; cursor_at?: string; cursor_id?: string }

export default async function CreatorsDirectoryPage({
  params, searchParams,
}: { params: Promise<{ locale: string }>; searchParams: Promise<Search> }) {
  const { locale } = await params
  if (!isLocale(locale)) notFound()
  const loc = locale as Locale
  const supabase = await createSupabaseServerClient()
  await requireOpsPage(supabase, loc)
  const messages = await getDictionary(loc)
  const sp = await searchParams
  const filters = normalizeDirectoryParams(sp)
  const cursor = sp.cursor_at && sp.cursor_id ? { createdAt: sp.cursor_at, id: sp.cursor_id } : null
  const data = await listCreatorsDirectory(supabase, { ...filters, cursor, limit: 25 })
  return (
    <CreatorsDirectoryView
      t={messages.creators}
      locale={loc}
      data={data}
      actions={{ setCreatorStatus, reinstateCreator, setCreatorVerified, addCreatorNote, bulkSetCreatorStatus }}
    />
  )
}
