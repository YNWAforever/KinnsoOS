'use server'

import { createSupabaseServerClient } from '@/lib/supabase/server'
import { validateMerchantApplicationInput, type MerchantApplicationInput, type ValidationErrors } from '@/lib/merchants/application-validation'

type ActionFailure = { ok: false; errors: ValidationErrors }
type ActionResult<T extends Record<string, unknown> = Record<string, never>> =
  | ({ ok: true } & T)
  | ActionFailure

const formError = (message: string): ActionFailure => ({ ok: false, errors: { form: [message] } })

/**
 * Direct owner-RLS insert (merchant_applications_owner_insert), not an RPC — matches the
 * agent_waitlist precedent: no money/state beyond a pending review row, RLS bounds the
 * damage (one pending row per user via the DB's partial unique index), and a duplicate
 * insert (23505, from an already-pending application) is treated as a soft success so the
 * UI doesn't leak whether a row already exists. `hp` is a form honeypot — filled only by
 * bots, which get a silent success and no write.
 */
export async function submitMerchantApplicationAction(
  input: MerchantApplicationInput,
  hp?: string,
): Promise<ActionResult<{ id: string }>> {
  if (hp) return { ok: true, id: '' }

  const supabase = await createSupabaseServerClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return formError('Sign in is required')

  const errors = validateMerchantApplicationInput(input)
  if (Object.keys(errors).length) return { ok: false, errors }

  const { data, error } = await supabase
    .from('merchant_applications')
    .insert({
      user_id: user.id,
      company_name: input.companyName.trim(),
      contact_name: input.contactName.trim() || null,
      contact_email: input.contactEmail.trim(),
      website_url: input.websiteUrl.trim() || null,
      pitch: input.pitch.trim() || null,
      status: 'pending',
    })
    .select('id')
    .single()

  if (error || !data) {
    if (error && error.code !== '23505') console.error('[merchants:apply] submit failed', error)
    return formError('Your application could not be submitted. Please try again.')
  }

  return { ok: true, id: data.id as string }
}
