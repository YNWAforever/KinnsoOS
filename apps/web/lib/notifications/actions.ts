'use server'

import { revalidatePath } from 'next/cache'
import { createSupabaseServerClient } from '@/lib/supabase/server'
import { requireCreatorAction } from '@/lib/admin/guard'
import { formError, type ActionResult } from '@/lib/admin/result'
import type { Locale } from '@/lib/i18n/config'

/**
 * Marks one of the caller's own notifications read. Relies on RLS
 * (notifications_update_own + the read_at-only column grant) as the actual authorization
 * boundary -- the .eq('creator_id', ...) here is defense in depth, not the only guard.
 */
export async function markNotificationReadAction(
  locale: Locale, notificationId: string,
): Promise<ActionResult<{ id: string }>> {
  const supabase = await createSupabaseServerClient()
  const gate = await requireCreatorAction(supabase)
  if (!gate.ok) return gate

  const { data, error } = await supabase
    .from('notifications')
    .update({ read_at: new Date().toISOString() })
    .eq('id', notificationId)
    .eq('creator_id', gate.user.id)
    .select('id')
    .maybeSingle()

  if (error || !data) {
    if (error) console.error('[notifications] markNotificationReadAction failed', error)
    return formError('Could not mark this notification as read')
  }
  revalidatePath(`/${locale}/studio/inbox`)
  return { ok: true, id: notificationId }
}
