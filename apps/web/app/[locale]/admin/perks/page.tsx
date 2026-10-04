import { notFound } from 'next/navigation'
import { isLocale, type Locale, LOCALES } from '@/lib/i18n/config'
import { getDictionary } from '@/lib/i18n/dictionaries'
import { createSupabaseServerClient } from '@/lib/supabase/server'
import { requireOpsPage } from '@/lib/admin/guard'
import { listAllPerks } from '@/lib/admin/perks-queries'
import { createPerkAction, updatePerkAction, togglePerkActiveAction } from '@/lib/admin/perks-actions'
import { AdminPerksView } from '@/components/kinnso/admin/AdminPerksView'
import type { PerkInput } from '@/lib/admin/perks-validation'

export function generateStaticParams() {
  return LOCALES.map((locale) => ({ locale }))
}

export default async function AdminPerksPage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params
  if (!isLocale(locale)) notFound()
  const loc = locale as Locale
  const supabase = await createSupabaseServerClient()
  // Gate inline: Next renders layout + page in parallel (the layout gate is not a barrier).
  await requireOpsPage(supabase, loc)
  const messages = await getDictionary(loc)
  const perks = await listAllPerks(supabase)

  async function onCreate(input: PerkInput) {
    'use server'
    return createPerkAction(loc, input)
  }
  async function onUpdate(id: string, input: PerkInput) {
    'use server'
    return updatePerkAction(loc, id, input)
  }
  async function onToggle(id: string, active: boolean) {
    'use server'
    return togglePerkActiveAction(loc, id, active)
  }

  return (
    <AdminPerksView t={messages.perks} perks={perks} onCreate={onCreate} onUpdate={onUpdate} onToggle={onToggle} />
  )
}
