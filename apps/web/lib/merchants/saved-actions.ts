import { revalidatePath } from 'next/cache'
import { createSupabaseServerClient } from '@/lib/supabase/server'
import { requireMerchantAction } from '@/lib/admin/guard'
import { formError, type ActionResult } from '@/lib/admin/result'
import type { Locale } from '@/lib/i18n/config'

const merchantCreatorsPath = (locale: Locale) => `/${locale}/merchants/dashboard/creators`

/** Save a public creator to the merchant's list (idempotent upsert). */
export async function saveCreatorAction(
  locale: Locale,
  creatorId: string,
): Promise<ActionResult<{ creatorId: string }>> {
  'use server'
  const supabase = await createSupabaseServerClient()
  const gate = await requireMerchantAction(supabase)
  if (!gate.ok) return gate

  const { error } = await supabase
    .from('merchant_saved_creators')
    .upsert(
      { merchant_id: gate.merchantId, creator_id: creatorId },
      { onConflict: 'merchant_id,creator_id' },
    )
  if (error) return formError('Creator could not be saved')

  revalidatePath(merchantCreatorsPath(locale))
  return { ok: true, creatorId }
}

/** Remove a creator from the merchant's saved list. */
export async function unsaveCreatorAction(
  locale: Locale,
  creatorId: string,
): Promise<ActionResult<{ creatorId: string }>> {
  'use server'
  const supabase = await createSupabaseServerClient()
  const gate = await requireMerchantAction(supabase)
  if (!gate.ok) return gate

  const { error } = await supabase
    .from('merchant_saved_creators')
    .delete()
    .eq('merchant_id', gate.merchantId)
    .eq('creator_id', creatorId)
  if (error) return formError('Creator could not be removed')

  revalidatePath(merchantCreatorsPath(locale))
  return { ok: true, creatorId }
}

/** Set (or clear) the merchant's private note on a saved creator. */
export async function setSavedNoteAction(
  locale: Locale,
  creatorId: string,
  note: string,
): Promise<ActionResult<{ creatorId: string }>> {
  'use server'
  const supabase = await createSupabaseServerClient()
  const gate = await requireMerchantAction(supabase)
  if (!gate.ok) return gate

  const { error } = await supabase
    .from('merchant_saved_creators')
    .update({ note: note.trim() })
    .eq('merchant_id', gate.merchantId)
    .eq('creator_id', creatorId)
  if (error) return formError('Note could not be saved')

  revalidatePath(merchantCreatorsPath(locale))
  return { ok: true, creatorId }
}
