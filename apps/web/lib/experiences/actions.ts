'use server'

import { randomUUID } from 'node:crypto'
import { revalidatePath } from 'next/cache'
import { createSupabaseServerClient } from '@/lib/supabase/server'
import { requireMerchantAction } from '@/lib/admin/guard'
import { makeSlug } from '@/lib/guides/slug'
import { validateExperienceInput, type ValidationErrors } from '@/lib/experiences/validation'
import type { ExperienceInput } from '@/lib/experiences/types'
import type { Locale } from '@/lib/i18n/config'

type ActionFailure = { ok: false; errors: ValidationErrors }
type ActionResult<T extends Record<string, unknown> = Record<string, never>> =
  | ({ ok: true } & T)
  | ActionFailure

const formError = (message: string): ActionFailure => ({ ok: false, errors: { form: [message] } })
const listPath = (locale: Locale) => `/${locale}/merchants/dashboard/experiences`

export async function createExperienceAction(
  rawInput: ExperienceInput,
  options: { publish: boolean; locale: Locale },
): Promise<ActionResult<{ id: string; slug: string }>> {
  const supabase = await createSupabaseServerClient()
  const gate = await requireMerchantAction(supabase)
  if (!gate.ok) return gate

  const validation = validateExperienceInput(rawInput)
  if (!validation.ok) return validation
  const p = validation.parsed

  const { data, error } = await supabase
    .from('experiences')
    .insert({
      merchant_profile_id: gate.merchantId,
      slug: makeSlug(p.title, randomUUID().slice(0, 6)),
      title: p.title,
      summary: p.summary,
      description: p.description,
      city: p.city,
      price_amount: p.priceAmount,
      currency: p.currency,
      duration_minutes: p.durationMinutes,
      cover_url: p.coverUrl,
      status: options.publish ? 'published' : 'draft',
      published_at: options.publish ? new Date().toISOString() : null,
    })
    .select('id, slug')
    .single()
  if (error || !data) {
    if (error) console.error('[experiences] create failed', error)
    return formError('Experience could not be saved')
  }

  revalidatePath(listPath(options.locale))
  return { ok: true, id: data.id as string, slug: data.slug as string }
}

export async function updateExperienceAction(
  id: string,
  rawInput: ExperienceInput,
  options: { publish: boolean; locale: Locale },
): Promise<ActionResult<{ id: string }>> {
  const supabase = await createSupabaseServerClient()
  const gate = await requireMerchantAction(supabase)
  if (!gate.ok) return gate

  const validation = validateExperienceInput(rawInput)
  if (!validation.ok) return validation
  const p = validation.parsed

  // Read current status (RLS + merchant scope) to decide the published_at transition.
  const { data: current } = await supabase
    .from('experiences')
    .select('status, published_at')
    .eq('id', id)
    .eq('merchant_profile_id', gate.merchantId)
    .maybeSingle()
  if (!current) return formError('Experience not found')

  const willPublish = options.publish || current.status === 'published'
  const { data, error } = await supabase
    .from('experiences')
    .update({
      title: p.title,
      summary: p.summary,
      description: p.description,
      city: p.city,
      price_amount: p.priceAmount,
      currency: p.currency,
      duration_minutes: p.durationMinutes,
      cover_url: p.coverUrl,
      status: willPublish ? 'published' : current.status,
      published_at: willPublish ? (current.published_at ?? new Date().toISOString()) : current.published_at,
    })
    .eq('id', id)
    .eq('merchant_profile_id', gate.merchantId)
    .select('id')
    .maybeSingle()
  if (error || !data) {
    if (error) console.error('[experiences] update failed', error)
    return formError('Experience could not be saved')
  }

  revalidatePath(listPath(options.locale))
  return { ok: true, id: data.id as string }
}

export async function setExperienceStatusAction(
  id: string,
  status: 'published' | 'paused',
  options: { locale: Locale },
): Promise<ActionResult<{ id: string; status: 'published' | 'paused' }>> {
  const supabase = await createSupabaseServerClient()
  const gate = await requireMerchantAction(supabase)
  if (!gate.ok) return gate
  if (status !== 'published' && status !== 'paused') return formError('Invalid status')

  // Re-publishing after a pause re-stamps published_at (fresh publish date) — acceptable
  // for R2; revisit if R3 ever needs "originally published".
  const patch = status === 'published'
    ? { status, published_at: new Date().toISOString() }
    : { status }

  const { data, error } = await supabase
    .from('experiences')
    .update(patch)
    .eq('id', id)
    .eq('merchant_profile_id', gate.merchantId)
    .select('id')
    .maybeSingle()
  if (error || !data) {
    if (error) console.error('[experiences] setStatus failed', error)
    return formError('Status could not be changed')
  }

  revalidatePath(listPath(options.locale))
  return { ok: true, id, status }
}
