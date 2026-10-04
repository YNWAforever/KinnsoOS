import type { Metadata } from 'next'
import { notFound } from 'next/navigation'
import { randomUUID } from 'node:crypto'
import { isLocale, type Locale, LOCALES } from '@/lib/i18n/config'
import { getDictionary } from '@/lib/i18n/dictionaries'
import { createSupabaseServerClient } from '@/lib/supabase/server'
import { isAgentConfigured } from '@/lib/agent/config'
import { getAgentMessages } from '@/lib/agent/queries'
import { resolveConfiguredProductState } from '@/lib/product-state'
import { AgentChatView } from '@/components/kinnso/pages/AgentChatView'
import { AgentWaitlistView } from '@/components/kinnso/pages/AgentWaitlistView'
import { buildPageMetadata } from '@/lib/seo/metadata'

export function generateStaticParams() {
  return LOCALES.map((locale) => ({ locale }))
}

export async function generateMetadata({ params }: { params: Promise<{ locale: string }> }): Promise<Metadata> {
  const { locale } = await params
  if (!isLocale(locale)) return {}
  const loc = locale as Locale
  const dict = await getDictionary(loc)
  const { agentLive } = resolveConfiguredProductState()
  const seo = agentLive ? dict.seo.agentLive : dict.seo.agentWaitlist
  return buildPageMetadata({ path: '/agent', locale: loc, title: seo.title, description: seo.description })
}

export default async function AgentPage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params
  if (!isLocale(locale)) notFound()
  const loc = locale as Locale
  const messages = await getDictionary(loc)
  const { agentLive, bookingLive } = resolveConfiguredProductState()

  if (!agentLive) {
    return <AgentWaitlistView locale={loc} t={messages.agent} featureInterest={messages.featureInterest} />
  }

  const supabase = await createSupabaseServerClient()
  // auth.getUser() makes this page request-dynamic — needed so the chat view knows
  // whether to send an anonSessionId.
  const { data: { user } } = await supabase.auth.getUser()

  // Signed-in travellers can read their saved conversation; anonymous visitors
  // have the insert-only path and therefore no history to fetch.
  const initialMessages = user ? await getAgentMessages(supabase, user.id) : []

  return (
    <AgentChatView
      locale={loc}
      t={messages.agent}
      configured={isAgentConfigured()}
      bookingLive={bookingLive}
      viewerSignedIn={Boolean(user)}
      anonSessionId={randomUUID()}
      initialMessages={initialMessages.map((m) => ({ id: m.id, role: m.role, content: m.content }))}
    />
  )
}
