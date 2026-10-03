import { notFound } from 'next/navigation'
import { isLocale, type Locale, LOCALES } from '@/lib/i18n/config'
import { getDictionary } from '@/lib/i18n/dictionaries'
import { createSupabaseServerClient } from '@/lib/supabase/server'
import { requireOpsPage } from '@/lib/admin/guard'
import { getTeamOverview } from '@/lib/admin/team-queries'
import { inviteMemberAction } from '@/lib/admin/team-actions'
import { TeamOverviewView } from '@/components/kinnso/admin/team/TeamOverviewView'

export function generateStaticParams() {
  return LOCALES.map((locale) => ({ locale }))
}

export default async function TeamOverviewPage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params
  if (!isLocale(locale)) notFound()
  const loc = locale as Locale
  const supabase = await createSupabaseServerClient()
  await requireOpsPage(supabase, loc)
  const messages = await getDictionary(loc)
  const overview = await getTeamOverview(supabase)
  return <TeamOverviewView t={messages.team} locale={loc} overview={overview} onInvite={inviteMemberAction} />
}
