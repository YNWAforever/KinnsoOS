'use server'

import { revalidatePath } from 'next/cache'
import { createSupabaseServerClient } from '@/lib/supabase/server'
import { requireMerchantAction } from '@/lib/admin/guard'
import { validateAvailabilityInput, type ValidationErrors } from '@/lib/experiences/availability-validation'
import type { AvailabilityInput } from '@/lib/experiences/availability-types'
import type { Locale } from '@/lib/i18n/config'

type ActionFailure = { ok: false; errors: ValidationErrors }
type ActionResult<T extends Record<string, unknown> = Record<string, never>> =
  | ({ ok: true } & T)
  | ActionFailure

const formError = (message: string): ActionFailure => ({ ok: false, errors: { form: [message] } })
const availabilityPath = (locale: Locale, experienceId: string) =>
  `/${locale}/merchants/dashboard/experiences/${experienceId}/availability`

export async function addAvailabilityDateAction(
  experienceId: string,
  rawInput: AvailabilityInput,
  options: { locale: Locale },
): Promise<ActionResult<{ id: string }>> {
  const supabase = await createSupabaseServerClient()
  const gate = await requireMerchantAction(supabase)
  if (!gate.ok) return gate

  const validation = validateAvailabilityInput(rawInput)
  if (!validation.ok) return validation
  const p = validation.parsed

  const { data: experience } = await supabase
    .from('experiences')
    .select('id')
    .eq('id', experienceId)
    .eq('merchant_profile_id', gate.merchantId)
    .maybeSingle()
  if (!experience) return formError('Experience not found')

  const { data, error } = await supabase
    .from('experience_availability')
    .insert({ experience_id: experienceId, date: p.date, capacity: p.capacity })
    .select('id')
    .single()
  if (error || !data) {
    if (error?.code === '23505') return formError('A date already exists for this experience')
    if (error) console.error('[experiences:availability] add failed', error)
    return formError('Date could not be saved')
  }

  revalidatePath(availabilityPath(options.locale, experienceId))
  return { ok: true, id: data.id as string }
}

export async function closeAvailabilityDateAction(
  experienceId: string,
  id: string,
  options: { locale: Locale },
): Promise<ActionResult<{ id: string }>> {
  const supabase = await createSupabaseServerClient()
  const gate = await requireMerchantAction(supabase)
  if (!gate.ok) return gate

  const { data, error } = await supabase
    .from('experience_availability')
    .update({ status: 'closed' })
    .eq('id', id)
    .eq('experience_id', experienceId)
    .select('id')
    .maybeSingle()
  if (error || !data) {
    if (error) console.error('[experiences:availability] close failed', error)
    return formError('Date could not be closed')
  }

  revalidatePath(availabilityPath(options.locale, experienceId))
  return { ok: true, id }
}
