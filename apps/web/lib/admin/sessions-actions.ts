// apps/web/lib/admin/sessions-actions.ts
'use server'

import { randomUUID } from 'node:crypto'
import { revalidatePath } from 'next/cache'
import { requireOpsAction } from '@/lib/admin/guard'
import { formError, type ActionResult } from '@/lib/admin/result'
import { listSessionRsvps } from '@/lib/admin/sessions-queries'
import { validateSessionInput, canGoLive } from '@/lib/sessions/validation'
import type { SessionInput } from '@/lib/sessions/types'
import { makeSlug } from '@/lib/guides/slug'
import { LOCALES, type Locale } from '@/lib/i18n/config'
import { createSupabaseServerClient } from '@/lib/supabase/server'

const adminSessionsPath = (locale: Locale) => `/${locale}/admin/sessions`

function revalidateSessionSurfaces(locale: Locale) {
  revalidatePath(adminSessionsPath(locale))
  for (const l of LOCALES) {
    revalidatePath(`/${l}`)
    revalidatePath(`/${l}/sessions`)
  }
}

export async function adminCreateSessionAction(
  locale: Locale,
  hostCreatorId: string,
  rawInput: SessionInput,
): Promise<ActionResult<{ id: string; slug: string }>> {
  const validation = validateSessionInput(rawInput)
  if (!validation.ok) return validation

  const supabase = await createSupabaseServerClient()
  const gate = await requireOpsAction(supabase)
  if (!gate.ok) return gate

  const p = validation.parsed
  const { data, error } = await supabase
    .from('community_sessions')
    .insert({
      host_creator_id: hostCreatorId,
      slug: makeSlug(p.title, randomUUID().slice(0, 6)),
      title: p.title, description: p.description, type: p.type,
      starts_at: p.startsAt, duration_minutes: p.durationMinutes,
      embed_url: p.embedUrl, replay_url: p.replayUrl, destination_tags: p.destinationTags,
    })
    .select('id, slug')
    .single()
  if (error || !data) {
    if (error) console.error('[admin:sessions] create failed', error)
    return formError('Session could not be created')
  }

  revalidateSessionSurfaces(locale)
  return { ok: true, id: data.id as string, slug: data.slug as string }
}

export async function adminUpdateSessionAction(
  locale: Locale,
  id: string,
  rawInput: SessionInput,
): Promise<ActionResult<{ id: string }>> {
  const validation = validateSessionInput(rawInput)
  if (!validation.ok) return validation

  const supabase = await createSupabaseServerClient()
  const gate = await requireOpsAction(supabase)
  if (!gate.ok) return gate

  const p = validation.parsed
  const { data, error } = await supabase
    .from('community_sessions')
    .update({
      title: p.title, description: p.description, type: p.type,
      starts_at: p.startsAt, duration_minutes: p.durationMinutes,
      embed_url: p.embedUrl, replay_url: p.replayUrl, destination_tags: p.destinationTags,
    })
    .eq('id', id)
    .select('id')
    .maybeSingle()
  if (error || !data) {
    if (error) console.error('[admin:sessions] update failed', error)
    return formError('Session could not be saved')
  }

  revalidateSessionSurfaces(locale)
  return { ok: true, id: data.id as string }
}

/** No host scope (ops can act on any session) — otherwise identical to the Studio version. */
export async function adminSetSessionStatusAction(
  locale: Locale,
  id: string,
  status: 'live' | 'ended' | 'cancelled',
): Promise<ActionResult<{ id: string; status: typeof status }>> {
  const supabase = await createSupabaseServerClient()
  const gate = await requireOpsAction(supabase)
  if (!gate.ok) return gate

  if (status === 'live') {
    const { data: current } = await supabase.from('community_sessions').select('embed_url').eq('id', id).maybeSingle()
    if (!current) return formError('Session not found')
    if (!canGoLive({ embedUrl: current.embed_url as string | null })) {
      return formError('Add a live embed URL before going live')
    }
  }

  const { data, error } = await supabase
    .from('community_sessions')
    .update({ status })
    .eq('id', id)
    .select('id')
    .maybeSingle()
  if (error || !data) {
    if (error) console.error('[admin:sessions] setStatus failed', error)
    return formError('Status could not be changed')
  }

  revalidateSessionSurfaces(locale)
  return { ok: true, id: data.id as string, status }
}

export async function adminDeleteSessionAction(
  locale: Locale,
  id: string,
): Promise<ActionResult<{ id: string }>> {
  const supabase = await createSupabaseServerClient()
  const gate = await requireOpsAction(supabase)
  if (!gate.ok) return gate

  const { data, error } = await supabase.from('community_sessions').delete().eq('id', id).select('id').maybeSingle()
  if (error || !data) {
    if (error) console.error('[admin:sessions] delete failed', error)
    return formError('Session could not be deleted')
  }

  revalidateSessionSurfaces(locale)
  return { ok: true, id: data.id as string }
}

export async function listSessionRsvpsForAdminAction(sessionId: string) {
  const supabase = await createSupabaseServerClient()
  const gate = await requireOpsAction(supabase)
  if (!gate.ok) return { ok: false as const, rsvps: [] }
  const rsvps = await listSessionRsvps(supabase, sessionId)
  return { ok: true as const, rsvps }
}
