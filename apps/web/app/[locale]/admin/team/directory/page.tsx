import { notFound } from 'next/navigation'
import { isLocale, type Locale, LOCALES } from '@/lib/i18n/config'
import { getDictionary } from '@/lib/i18n/dictionaries'
import { createSupabaseServerClient } from '@/lib/supabase/server'
import { requireOpsPage } from '@/lib/admin/guard'
import { getTeamMembers } from '@/lib/admin/team-queries'
import { setMemberRoleAction, suspendMemberAction, reactivateMemberAction } from '@/lib/admin/team-actions'
import { TeamDirectoryView } from '@/components/kinnso/admin/team/TeamDirectoryView'

export function generateStaticParams() {
  return LOCALES.map((locale) => ({ locale }))
}

export default async function TeamDirectoryPage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params
  if (!isLocale(locale)) notFound()
  const loc = locale as Locale
  const supabase = await createSupabaseServerClient()
  await requireOpsPage(supabase, loc)
  const messages = await getDictionary(loc)
  const members = await getTeamMembers(supabase)
  return (
    <TeamDirectoryView
      t={messages.team}
      locale={loc}
      members={members}
      onSetRole={setMemberRoleAction}
      onSuspend={suspendMemberAction}
      onReactivate={reactivateMemberAction}
    />
  )
}
