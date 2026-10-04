import { notFound } from 'next/navigation'
import { requireCreatorPage } from '@/lib/admin/guard'
import { isLocale, type Locale } from '@/lib/i18n/config'
import { getDictionary } from '@/lib/i18n/dictionaries'
import { createSupabaseServerClient } from '@/lib/supabase/server'
import { MyGuidesView } from '@/components/kinnso/pages/MyGuidesView'
import type { GuideListItem } from '@/lib/guides/types'

export default async function StudioGuidesPage({
  params,
}: {
  params: Promise<{ locale: string }>
}) {
  const { locale } = await params
  if (!isLocale(locale)) notFound()
  const messages = await getDictionary(locale as Locale)

  const supabase = await createSupabaseServerClient()
  const { user } = await requireCreatorPage(supabase, locale as Locale, 'creator')

  const { data } = await supabase
    .from('guides')
    .select('id, slug, title, city, cover_url, status')
    .eq('creator_id', user.id)
    .order('updated_at', { ascending: false })

  const guides: GuideListItem[] = (data ?? []).map((g) => ({
    id: g.id,
    slug: g.slug,
    title: g.title,
    city: g.city,
    cover: g.cover_url,
    status: g.status === 'published' ? 'published' : 'draft',
  }))

  return <MyGuidesView locale={locale as Locale} t={messages.studioGuides} guides={guides} />
}
