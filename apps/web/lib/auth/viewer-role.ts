import { getAuthorizationContext, type ServerSupabase } from './authorization-context'
import type { ViewerRole } from './viewer-role-policy'

export type { ViewerRole } from './viewer-role-policy'

export async function resolveViewerRole(
  supabase: ServerSupabase,
  // Callers that already validated the session can provide the user id and
  // avoid a second auth lookup while keeping the same central role policy.
  verifiedUserId?: string,
): Promise<ViewerRole> {
  const context = await getAuthorizationContext(supabase, verifiedUserId)
  if (context.role === 'indeterminate') {
    throw new Error('Unable to determine authorization context')
  }
  return context.role
}
