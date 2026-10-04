import { revalidatePath } from 'next/cache'
import { createSupabaseServerClient } from '@/lib/supabase/server'
import { requireMerchantAction } from '@/lib/admin/guard'
import { formError, type ActionResult } from '@/lib/admin/result'
import type { Locale } from '@/lib/i18n/config'

const merchantCreatorsPath = (locale: Locale) => `/${locale}/merchants/dashboard/creators`

/** Maps the RPC's raised error codes to friendly, surfaceable messages. */
const FRIENDLY: Record<string, string> = {
  invite_quota_exceeded: 'Your invite quota for this billing period has been reached',
  already_participant: 'This creator is already part of the mission',
  not_authorized: 'You are not authorized to invite for this mission',
  creator_not_found: 'That creator could not be found',
}

/** Find the first known error code mentioned in the RPC error message. */
function mapRpcError(error: unknown): string {
  const message = (error as { message?: string } | null)?.message ?? ''
  for (const [code, friendly] of Object.entries(FRIENDLY)) {
    if (message.includes(code)) return friendly
  }
  return 'The invite could not be sent'
}

/**
 * Invite a creator to one of the merchant's published missions. The
 * `merchant_invite_creator` RPC enforces ownership + the tier invite quota and
 * raises a typed error code we surface here.
 */
export async function inviteCreatorAction(
  locale: Locale,
  missionId: string,
  creatorId: string,
): Promise<ActionResult<{ inviteId: string }>> {
  'use server'
  const supabase = await createSupabaseServerClient()
  const gate = await requireMerchantAction(supabase)
  if (!gate.ok) return gate

  const { data, error } = await supabase.rpc('merchant_invite_creator', {
    p_mission_id: missionId,
    p_creator_id: creatorId,
  })
  if (error) return formError(mapRpcError(error))

  revalidatePath(merchantCreatorsPath(locale))
  return { ok: true, inviteId: (data as string) ?? '' }
}
