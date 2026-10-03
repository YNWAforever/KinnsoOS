import { notFound } from 'next/navigation'
import { requireCreatorPage } from '@/lib/admin/guard'
import { isLocale, type Locale } from '@/lib/i18n/config'
import { getDictionary } from '@/lib/i18n/dictionaries'
import { createSupabaseServerClient } from '@/lib/supabase/server'
import { MySessionsView } from '@/components/kinnso/pages/MySessionsView'
import type { SessionListItem, SessionType } from '@/lib/sessions/types'

export default async function StudioSessionsPage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params
  if (!isLocale(locale)) notFound()
  const messages = await getDictionary(locale as Locale)

  const supabase = await createSupabaseServerClient()
  const { user } = await requireCreatorPage(supabase, locale as Locale, 'creator')

  const { data } = await supabase
    .from('community_sessions')
    .select('id, slug, title, type, starts_at, status, embed_url')
    .eq('host_creator_id', user.id)
    .order('starts_at', { ascending: false })

  const sessions: SessionListItem[] = (data ?? []).map((s) => ({
    id: s.id, slug: s.slug, title: s.title, type: s.type as SessionType,
    startsAt: s.starts_at, status: s.status as SessionListItem['status'], embedUrl: s.embed_url,
  }))

  return <MySessionsView locale={locale as Locale} t={messages.studioSessions} sessions={sessions} />
}
