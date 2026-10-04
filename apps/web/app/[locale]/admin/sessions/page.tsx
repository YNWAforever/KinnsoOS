import { notFound } from 'next/navigation'
import { isLocale, type Locale } from '@/lib/i18n/config'
import { getDictionary } from '@/lib/i18n/dictionaries'
import { createSupabaseServerClient } from '@/lib/supabase/server'
import { requireOpsPage } from '@/lib/admin/guard'
import { listAllSessions, listCreatorsForHostPicker } from '@/lib/admin/sessions-queries'
import {
  adminCreateSessionAction, adminUpdateSessionAction, adminSetSessionStatusAction,
  adminDeleteSessionAction, listSessionRsvpsForAdminAction,
} from '@/lib/admin/sessions-actions'
import { AdminSessionsView } from '@/components/kinnso/admin/AdminSessionsView'

export default async function AdminSessionsPage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params
  if (!isLocale(locale)) notFound()
  const messages = await getDictionary(locale as Locale)

  const supabase = await createSupabaseServerClient()
  const loc = locale as Locale
  await requireOpsPage(supabase, loc)

  const [sessions, creators] = await Promise.all([listAllSessions(supabase), listCreatorsForHostPicker(supabase)])

  return (
    <AdminSessionsView
      t={messages.sessionsAdmin}
      sessions={sessions}
      creators={creators}
      onCreate={adminCreateSessionAction.bind(null, loc)}
      onUpdate={adminUpdateSessionAction.bind(null, loc)}
      onSetStatus={adminSetSessionStatusAction.bind(null, loc)}
      onDelete={adminDeleteSessionAction.bind(null, loc)}
      onListRsvps={listSessionRsvpsForAdminAction}
    />
  )
}
