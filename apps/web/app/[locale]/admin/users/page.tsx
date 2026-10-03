import { notFound } from 'next/navigation'
import { isLocale, type Locale, LOCALES } from '@/lib/i18n/config'
import { getDictionary } from '@/lib/i18n/dictionaries'
import { createSupabaseServerClient } from '@/lib/supabase/server'
import { requireOpsPage } from '@/lib/admin/guard'
import { listAdminUsers } from '@/lib/admin/users-queries'
import { setUserStatusAction, type UserKind, type UserStatus } from '@/lib/admin/users-actions'
import { AdminUsersView } from '@/components/kinnso/admin/AdminUsersView'

export function generateStaticParams() {
  return LOCALES.map((locale) => ({ locale }))
}

export default async function AdminUsersPage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params
  if (!isLocale(locale)) notFound()
  const loc = locale as Locale
  const supabase = await createSupabaseServerClient()
  // Gate inline: Next renders layout + page in parallel (the layout gate is not a barrier).
  await requireOpsPage(supabase, loc)
  const messages = await getDictionary(loc)
  const users = await listAdminUsers(supabase)

  async function onSetStatus(kind: UserKind, id: string, status: UserStatus) {
    'use server'
    return setUserStatusAction(loc, kind, id, status)
  }

  return <AdminUsersView t={messages.users} locale={loc} users={users} onSetStatus={onSetStatus} />
}
