import { notFound } from 'next/navigation'
import { requireCreatorPage } from '@/lib/admin/guard'
import { isLocale, type Locale } from '@/lib/i18n/config'
import { getDictionary } from '@/lib/i18n/dictionaries'
import { createSupabaseServerClient } from '@/lib/supabase/server'
import { updateSessionAction } from '@/lib/sessions/studio-actions'
import type { SessionType } from '@/lib/sessions/types'
import { SessionForm } from '@/components/kinnso/pages/SessionForm'

export default async function EditStudioSessionPage({ params }: { params: Promise<{ locale: string; id: string }> }) {
  const { locale, id } = await params
  if (!isLocale(locale)) notFound()
  const messages = await getDictionary(locale as Locale)
  const supabase = await createSupabaseServerClient()
  const { user } = await requireCreatorPage(supabase, locale as Locale, 'creator')

  const { data: session } = await supabase
    .from('community_sessions')
    .select('title, description, type, starts_at, duration_minutes, embed_url, replay_url, destination_tags')
    .eq('id', id)
    .eq('host_creator_id', user.id)
    .maybeSingle()
  if (!session) notFound()

  const t = messages.studioSessions
  const typeLabel = {
    destination_briefing: t.typeDestinationBriefing, ask_a_creator: t.typeAskACreator,
    merchant_spotlight: t.typeMerchantSpotlight, new_creator_intro: t.typeNewCreatorIntro,
  }
  return (
    <main className="k-container py-12">
      <h1 className="text-3xl font-black text-kinnso-ink">{t.formEditHeading}</h1>
      <div className="mt-6 max-w-2xl">
        <SessionForm
          t={t}
          typeLabel={typeLabel}
          initial={{
            title: session.title, description: session.description, type: session.type as SessionType,
            startsAt: session.starts_at, durationMinutes: String(session.duration_minutes),
            embedUrl: session.embed_url ?? '', replayUrl: session.replay_url ?? '',
            destinationTags: (session.destination_tags ?? []).join(', '),
          }}
          onSave={(input) => updateSessionAction(id, input, { locale: locale as Locale })}
          onDoneHref={`/${locale}/studio/sessions`}
        />
      </div>
    </main>
  )
}
