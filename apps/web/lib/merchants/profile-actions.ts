'use server'

import { revalidatePath } from 'next/cache'
import { createSupabaseServerClient } from '@/lib/supabase/server'
import { requireMerchantAction } from '@/lib/admin/guard'
import { validateMerchantProfileInput, type MerchantProfileInput, type ValidationErrors } from '@/lib/merchants/profile-validation'
import type { Locale } from '@/lib/i18n/config'

type ActionFailure = { ok: false; errors: ValidationErrors }
type ActionResult<T extends Record<string, unknown> = Record<string, never>> =
  | ({ ok: true } & T)
  | ActionFailure

const formError = (message: string): ActionFailure => ({ ok: false, errors: { form: [message] } })

/**
 * Owner-RLS update. The DB's column grants (R2A + R2B migrations) are the real
 * enforcement — this payload simply never mentions status/tier/slug, and a
 * hand-crafted call that did would be rejected by Postgres, not by this code.
 */
export async function updateMerchantProfileAction(
  locale: Locale,
  input: MerchantProfileInput,
): Promise<ActionResult<{ id: string }>> {
  const supabase = await createSupabaseServerClient()
  const gate = await requireMerchantAction(supabase)
  if (!gate.ok) return gate

  const errors = validateMerchantProfileInput(input)
  if (Object.keys(errors).length) return { ok: false, errors }

  const { data, error } = await supabase
    .from('merchant_profiles')
    .update({
      company_name: input.companyName.trim(),
      contact_name: input.contactName.trim() || null,
      contact_email: input.contactEmail.trim(),
      website_url: input.websiteUrl.trim() || null,
      tagline: input.tagline.trim() || null,
      city: input.city.trim() || null,
      logo_url: input.logoUrl.trim() || null,
    })
    .eq('id', gate.merchantId)
    .select('id')
    .maybeSingle()

  if (error || !data) {
    if (error) console.error('[merchants:profile] update failed', error)
    return formError('Profile could not be saved. Please try again.')
  }

  revalidatePath(`/${locale}/merchants/dashboard/profile`)
  return { ok: true, id: data.id as string }
}
