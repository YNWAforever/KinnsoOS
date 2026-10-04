// apps/web/lib/admin/sessions-queries.ts
import type { SupabaseClient } from '@supabase/supabase-js'
import type { Database } from '@kinnso/db'

export type AdminSession = Database['public']['Tables']['community_sessions']['Row']
export type SessionRsvp = Database['public']['Tables']['session_rsvps']['Row']

/** Ops full read, cancelled rows included (community_sessions_ops_all grants this). */
export async function listAllSessions(supabase: SupabaseClient<Database>): Promise<AdminSession[]> {
  const { data, error } = await supabase
    .from('community_sessions')
    .select('*')
    .order('starts_at', { ascending: false })
  if (error) throw error
  return data ?? []
}

/** The CRM-export read surface (D-R5-6) — ops only, per session_rsvps_ops_read. */
export async function listSessionRsvps(supabase: SupabaseClient<Database>, sessionId: string): Promise<SessionRsvp[]> {
  const { data, error } = await supabase
    .from('session_rsvps')
    .select('*')
    .eq('session_id', sessionId)
    .order('created_at', { ascending: true })
  if (error) throw error
  return data ?? []
}

/** Populates the ops "create on a creator's behalf" host picker. */
export async function listCreatorsForHostPicker(
  supabase: SupabaseClient<Database>,
): Promise<{ id: string; handle: string | null; displayName: string | null }[]> {
  const { data, error } = await supabase
    .from('creators')
    .select('id, handle, display_name')
    .order('display_name', { ascending: true })
  if (error) throw error
  return (data ?? []).map((c) => ({ id: c.id as string, handle: c.handle as string | null, displayName: c.display_name as string | null }))
}
