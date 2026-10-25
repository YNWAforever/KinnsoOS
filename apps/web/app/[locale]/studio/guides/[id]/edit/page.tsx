import { notFound, redirect } from 'next/navigation'
import { requireCreatorPage } from '@/lib/admin/guard'
import { isLocale, type Locale } from '@/lib/i18n/config'
import { getDictionary } from '@/lib/i18n/dictionaries'
import { createSupabaseServerClient } from '@/lib/supabase/server'
import { GuideForm } from '@/components/kinnso/GuideForm'
import { StructuredGuideForm,type StructuredContent } from '@/components/kinnso/StructuredGuideForm'
import { updateGuideAction } from '@/lib/guides/actions'
import type { GuideInput } from '@/lib/guides/types'

export default async function StudioEditGuidePage({
  params,
}: {
  params: Promise<{ locale: string; id: string }>
}) {
  const { locale, id } = await params
  if (!isLocale(locale)) notFound()
  const messages = await getDictionary(locale as Locale)

  const supabase = await createSupabaseServerClient()
  const { user } = await requireCreatorPage(supabase, locale as Locale, 'creator')

  // Published guides are publicly readable, so an id match alone is not ownership.
  // Restrict the editor to the signed-in creator; anyone else gets the same 404
  // as a missing id.
  const { data: guide } = await supabase
    .from('guides')
    .select('id, title, city, cover_url, summary')
    .eq('id', id)
    .eq('creator_id', user.id)
    .maybeSingle()
  if (!guide) notFound()

  const initial: GuideInput = {
    title: guide.title,
    city: guide.city,
    coverUrl: guide.cover_url ?? '',
    summary: guide.summary,
  }

  async function submitGuide(input: GuideInput, opts: { publish: boolean }) {
    'use server'
    const result = await updateGuideAction(id, input, { publish: opts.publish, locale })
    if (result.ok) redirect(`/${locale}/studio/guides`)
    return result
  }

  const version=await supabase.rpc('kinnso_guide_authoring',{p_guide_id:id})
  const authoring=version.data as {version?:number;content?:StructuredContent|null}|null
  return <><GuideForm t={messages.studioGuides} mode="edit" initial={initial} backHref={`/${locale}/studio/guides`} onSubmit={submitGuide} />{version.error?<p role="status">Structured versions are currently unavailable.</p>:<StructuredGuideForm id={id} locale={locale} initialVersion={authoring?.version??0} initialContent={authoring?.content??null}/>}</>
}
