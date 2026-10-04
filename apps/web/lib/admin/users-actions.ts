import { revalidatePath } from 'next/cache'
import { createSupabaseServerClient } from '@/lib/supabase/server'
import { requireOpsAction } from '@/lib/admin/guard'
import { formError, type ActionResult } from '@/lib/admin/result'
import type { Locale } from '@/lib/i18n/config'

export type UserKind = 'creator' | 'ops'
export type UserStatus = 'active' | 'suspended'

/** DB raise-message → friendly copy. The setter raises these bare messages. */
const FRIENDLY: Record<string, string> = {
  cannot_suspend_self: 'You cannot suspend your own ops account.',
  last_active_ops: 'You cannot suspend the last active ops member.',
  forbidden: 'Active ops access is required.',
  bad_status: 'Invalid status.',
  bad_kind: 'Invalid user type.',
  not_found: 'That user no longer exists. Refresh and try again.',
}

export async function setUserStatusAction(
  locale: Locale,
  kind: UserKind,
  id: string,
  status: UserStatus,
): Promise<ActionResult<{ id: string; status: UserStatus }>> {
  'use server'
  const supabase = await createSupabaseServerClient()
  const gate = await requireOpsAction(supabase)
  if (!gate.ok) return gate
  if (kind !== 'creator' && kind !== 'ops') return formError(FRIENDLY.bad_kind)
  if (status !== 'active' && status !== 'suspended') return formError(FRIENDLY.bad_status)

  const { error } = await supabase.rpc('admin_set_user_status', { p_kind: kind, p_id: id, p_status: status })
  if (error) {
    console.error('[admin:users] setUserStatus failed', error)
    const key = Object.keys(FRIENDLY).find((k) => error.message.includes(k))
    return formError(key ? FRIENDLY[key] : 'User status could not be changed')
  }
  revalidatePath(`/${locale}/admin/users`)
  return { ok: true, id, status }
}
