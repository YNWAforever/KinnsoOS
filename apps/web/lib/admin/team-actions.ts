import { revalidatePath } from 'next/cache'
import { createSupabaseServerClient } from '@/lib/supabase/server'
import { requireOpsAction } from '@/lib/admin/guard'
import { formError, type ActionResult, type ActionFailure } from '@/lib/admin/result'
import { validateReason } from '@/lib/admin/ops-validation'
import type { Locale } from '@/lib/i18n/config'

const teamPath      = (locale: Locale) => `/${locale}/admin/team`
const directoryPath = (locale: Locale) => `/${locale}/admin/team/directory`

const VALID_ROLES = ['owner', 'admin', 'moderator', 'analyst'] as const
type OpsRole = (typeof VALID_ROLES)[number]
const isOpsRole = (r: string): r is OpsRole => (VALID_ROLES as readonly string[]).includes(r)

const FRIENDLY: Record<string, string> = {
  forbidden:            'Owner access is required.',
  reason_required:      'A reason is required.',
  reason_too_long:      'The reason is too long (max 500 characters).',
  bad_role:             'Invalid role.',
  email_required:       'An email address is required.',
  self_role_change:     "You can't change your own role.",
  self_suspend:         "You can't suspend yourself.",
  last_owner:           'There must be at least one active owner.',
  not_found:            'Member not found. Refresh and try again.',
  not_found_or_not_pending: 'Invite not found or already processed.',
  email_mismatch:       'This invite was sent to a different email address.',
  invite_accepted:      'This invite has already been accepted.',
  invite_revoked:       'This invite has been revoked.',
  invite_expired:       'This invite has expired.',
}
const mapError = (msg: string): string => {
  const key = Object.keys(FRIENDLY).find((k) => msg.includes(k))
  return key ? FRIENDLY[key] : 'An unexpected error occurred.'
}

export async function inviteMemberAction(
  locale: Locale, email: string, role: string,
): Promise<ActionResult<{ token: string }>> {
  'use server'
  const supabase = await createSupabaseServerClient()
  const gate = await requireOpsAction(supabase)
  if (!gate.ok) return gate
  if (!email || !email.trim()) return formError(FRIENDLY.email_required)
  if (!isOpsRole(role)) return formError(FRIENDLY.bad_role)
  const { data, error } = await supabase.rpc('admin_invite_ops_member', { p_email: email.trim(), p_role: role })
  if (error || !data) {
    if (error) console.error('[admin:team] inviteMember failed', error)
    return formError(mapError(error?.message ?? ''))
  }
  revalidatePath(teamPath(locale))
  return { ok: true, token: data as string }
}

export async function revokeInviteAction(
  locale: Locale, inviteId: string,
): Promise<{ ok: true } | ActionFailure> {
  'use server'
  const supabase = await createSupabaseServerClient()
  const gate = await requireOpsAction(supabase)
  if (!gate.ok) return gate
  const { error } = await supabase.rpc('admin_revoke_ops_invite', { p_invite_id: inviteId })
  if (error) {
    console.error('[admin:team] revokeInvite failed', error)
    return formError(mapError(error.message))
  }
  revalidatePath(teamPath(locale))
  return { ok: true }
}

export async function setMemberRoleAction(
  locale: Locale, memberId: string, role: string, reason: string,
): Promise<{ ok: true } | ActionFailure> {
  'use server'
  const supabase = await createSupabaseServerClient()
  const gate = await requireOpsAction(supabase)
  if (!gate.ok) return gate
  if (!isOpsRole(role)) return formError(FRIENDLY.bad_role)
  const rErr = validateReason(reason)
  if (rErr) return formError(FRIENDLY[rErr] ?? rErr)
  const { error } = await supabase.rpc('admin_set_ops_member_role', { p_member_id: memberId, p_role: role, p_reason: reason.trim() })
  if (error) {
    console.error('[admin:team] setMemberRole failed', error)
    return formError(mapError(error.message))
  }
  revalidatePath(directoryPath(locale))
  return { ok: true }
}

export async function suspendMemberAction(
  locale: Locale, memberId: string, reason: string,
): Promise<{ ok: true } | ActionFailure> {
  'use server'
  const supabase = await createSupabaseServerClient()
  const gate = await requireOpsAction(supabase)
  if (!gate.ok) return gate
  const rErr = validateReason(reason)
  if (rErr) return formError(FRIENDLY[rErr] ?? rErr)
  const { error } = await supabase.rpc('admin_suspend_ops_member', { p_member_id: memberId, p_reason: reason.trim() })
  if (error) {
    console.error('[admin:team] suspendMember failed', error)
    return formError(mapError(error.message))
  }
  revalidatePath(directoryPath(locale))
  return { ok: true }
}

export async function reactivateMemberAction(
  locale: Locale, memberId: string, reason: string,
): Promise<{ ok: true } | ActionFailure> {
  'use server'
  const supabase = await createSupabaseServerClient()
  const gate = await requireOpsAction(supabase)
  if (!gate.ok) return gate
  const rErr = validateReason(reason)
  if (rErr) return formError(FRIENDLY[rErr] ?? rErr)
  const { error } = await supabase.rpc('admin_reactivate_ops_member', { p_member_id: memberId, p_reason: reason.trim() })
  if (error) {
    console.error('[admin:team] reactivateMember failed', error)
    return formError(mapError(error.message))
  }
  revalidatePath(directoryPath(locale))
  return { ok: true }
}
