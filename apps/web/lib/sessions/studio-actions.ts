'use server'

import { randomUUID } from 'node:crypto'
import { revalidatePath } from 'next/cache'
import { createSupabaseServerClient } from '@/lib/supabase/server'
import { requireCreatorAction } from '@/lib/admin/guard'
import { makeSlug } from '@/lib/guides/slug'
import { validateSessionInput, canGoLive, type ValidationErrors, type ParsedSession } from '@/lib/sessions/validation'
import type { SessionInput } from '@/lib/sessions/types'
import type { Locale } from '@/lib/i18n/config'

type ActionFailure = { ok: false; errors: ValidationErrors }
type ActionResult<T extends Record<string, unknown> = Record<string, never>> =
  | ({ ok: true } & T)
  | ActionFailure

const formError = (message: string): ActionFailure => ({ ok: false, errors: { form: [message] } })
const listPath = (locale: Locale) => `/${locale}/studio/sessions`

function toRow(p: ParsedSession) {
  return {
    title: p.title,
    description: p.description,
    type: p.type,
    starts_at: p.startsAt,
    duration_minutes: p.durationMinutes,
    embed_url: p.embedUrl,
    replay_url: p.replayUrl,
    destination_tags: p.destinationTags,
  }
}

export async function createSessionAction(
  rawInput: SessionInput,
  options: { locale: Locale },
): Promise<ActionResult<{ id: string; slug: string }>> {
  const validation = validateSessionInput(rawInput)
  if (!validation.ok) return validation

  const supabase = await createSupabaseServerClient()
  const gate = await requireCreatorAction(supabase)
  if (!gate.ok) return gate

  const { data, error } = await supabase
    .from('community_sessions')
    .insert({
      host_creator_id: gate.user.id,
      slug: makeSlug(validation.parsed.title, randomUUID().slice(0, 6)),
      ...toRow(validation.parsed),
    })
    .select('id, slug')
    .single()
  if (error || !data) {
    if (error) console.error('[sessions:studio] create failed', error)
    return formError('Session could not be saved')
  }

  revalidatePath(listPath(options.locale))
  return { ok: true, id: data.id as string, slug: data.slug as string }
}

export async function updateSessionAction(
  id: string,
  rawInput: SessionInput,
  options: { locale: Locale },
): Promise<ActionResult<{ id: string }>> {
  const validation = validateSessionInput(rawInput)
  if (!validation.ok) return validation

  const supabase = await createSupabaseServerClient()
  const gate = await requireCreatorAction(supabase)
  if (!gate.ok) return gate

  const { data, error } = await supabase
    .from('community_sessions')
    .update(toRow(validation.parsed))
    .eq('id', id)
    .eq('host_creator_id', gate.user.id)
    .select('id')
    .maybeSingle()
  if (error || !data) {
    if (error) console.error('[sessions:studio] update failed', error)
    return formError('Session could not be saved')
  }

  revalidatePath(listPath(options.locale))
  return { ok: true, id: data.id as string }
}

/**
 * Shared by Studio and ops (Task 9 wraps its own ops-scoped version). "live"
 * requires an embed_url (D-R5-4) — checked by reading the row first, RLS-scoped
 * to the caller's own sessions.
 */
export async function setSessionStatusAction(
  id: string,
  status: 'live' | 'ended' | 'cancelled',
  options: { locale: Locale },
): Promise<ActionResult<{ id: string; status: typeof status }>> {
  const supabase = await createSupabaseServerClient()
  const gate = await requireCreatorAction(supabase)
  if (!gate.ok) return gate

  if (status === 'live') {
    const { data: current } = await supabase
      .from('community_sessions')
      .select('embed_url')
      .eq('id', id)
      .eq('host_creator_id', gate.user.id)
      .maybeSingle()
    if (!current) return formError('Session not found')
    if (!canGoLive({ embedUrl: current.embed_url as string | null })) {
      return formError('Add a live embed URL before going live')
    }
  }

  const { data, error } = await supabase
    .from('community_sessions')
    .update({ status })
    .eq('id', id)
    .eq('host_creator_id', gate.user.id)
    .select('id')
    .maybeSingle()
  if (error || !data) {
    if (error) console.error('[sessions:studio] setStatus failed', error)
    return formError('Status could not be changed')
  }

  revalidatePath(listPath(options.locale))
  return { ok: true, id: data.id as string, status }
}
