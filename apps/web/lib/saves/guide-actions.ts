'use server'

import { revalidatePath } from 'next/cache'
import { createSupabaseServerClient } from '@/lib/supabase/server'
import { requireTravelerAction } from '@/lib/admin/guard'
import { saveAuthFailure, saveFailed, type SaveOutcome } from '@/lib/saves/result'
import type { Locale } from '@/lib/i18n/config'

const tripsPath = (locale: Locale) => `/${locale}/trips`

/** Save a guide to the traveller's list (idempotent upsert). */
export async function saveGuideAction(
  locale: Locale,
  guideId: string,
): Promise<SaveOutcome<{ guideId: string }>> {
  const supabase = await createSupabaseServerClient()
  const gate = await requireTravelerAction(supabase)
  // Distinguished from a write failure: the viewer signed in, then the session
  // lapsed before they clicked. They should be asked to re-authenticate and
  // returned to this guide, not told the save broke.
  if (!gate.ok) return saveAuthFailure(gate.errors)

  // ignoreDuplicates compiles to INSERT ... ON CONFLICT DO NOTHING, never
  // ON CONFLICT DO UPDATE -- so no UPDATE grant on guide_saves is needed, and a
  // traveller can never reassign an existing save row's guide_id via this call
  // (which would desync guides.saves_count from the AFTER INSERT OR DELETE-only
  // trigger). See 20260706094500_r6a_revoke_saves_update_grant.sql.
  const { error } = await supabase
    .from('guide_saves')
    .upsert(
      { guide_id: guideId, traveler_user_id: gate.user.id },
      { onConflict: 'guide_id,traveler_user_id', ignoreDuplicates: true },
    )
  if (error) return saveFailed('Guide could not be saved')

  revalidatePath(tripsPath(locale))
  return { ok: true, guideId }
}

/** Remove a guide from the traveller's saved list. */
export async function unsaveGuideAction(
  locale: Locale,
  guideId: string,
): Promise<SaveOutcome<{ guideId: string }>> {
  const supabase = await createSupabaseServerClient()
  const gate = await requireTravelerAction(supabase)
  // Distinguished from a write failure: the viewer signed in, then the session
  // lapsed before they clicked. They should be asked to re-authenticate and
  // returned to this guide, not told the save broke.
  if (!gate.ok) return saveAuthFailure(gate.errors)

  const { error } = await supabase
    .from('guide_saves')
    .delete()
    .eq('guide_id', guideId)
    .eq('traveler_user_id', gate.user.id)
  if (error) return saveFailed('Guide could not be removed')

  revalidatePath(tripsPath(locale))
  return { ok: true, guideId }
}
