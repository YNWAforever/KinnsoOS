import { notFound, redirect } from 'next/navigation'
import { requireCreatorPage } from '@/lib/admin/guard'
import { isLocale, type Locale, LOCALES } from '@/lib/i18n/config'
import { getDictionary } from '@/lib/i18n/dictionaries'
import { createSupabaseServerClient } from '@/lib/supabase/server'
import { DnaSchema } from '@kinnso/scan'
import { getCreatorStoredTier } from '@/lib/contribution/queries'
import { policyForTier } from '@/lib/copilot/policy'
import { isCopilotConfigured } from '@/lib/copilot/config'
import { getRecentMessages, countUserMessagesToday } from '@/lib/copilot/queries'
import { CreatorCopilotView } from '@/components/kinnso/pages/CreatorCopilotView'

export function generateStaticParams() {
  return LOCALES.map((locale) => ({ locale }))
}

export default async function StudioCopilotPage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params
  if (!isLocale(locale)) notFound()
  const loc = locale as Locale
  const messages = await getDictionary(loc)

  const supabase = await createSupabaseServerClient()
  const { user } = await requireCreatorPage(supabase, loc)

  const { data: dnaRow } = await supabase.from('creator_dna').select('final').eq('creator_id', user.id).single()
  if (!DnaSchema.safeParse((dnaRow as { final?: unknown } | null)?.final).success) redirect(`/${loc}/creator`)

  const [tier, recent, used] = await Promise.all([
    getCreatorStoredTier(supabase, user.id),
    getRecentMessages(supabase, user.id),
    countUserMessagesToday(supabase, user.id),
  ])
  const policy = policyForTier(tier)
  const remaining = Math.max(0, policy.dailyLimit - used)

  return (
    <CreatorCopilotView
      locale={loc}
      t={messages.copilot}
      configured={isCopilotConfigured()}
      remaining={remaining}
      initialMessages={recent.map((m) => ({ id: m.id, role: m.role, content: m.content }))}
    />
  )
}
