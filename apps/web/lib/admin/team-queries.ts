import type { SupabaseClient } from '@supabase/supabase-js'
import type { Database } from '@kinnso/db'

type Client = SupabaseClient<Database>

export interface MemberRow {
  id: string
  displayName: string
  userId: string
  role: string
  status: string
  joinedAt: string
}

export interface TeamOverview {
  members: MemberRow[]
  byRole: Record<string, number>
  pendingInvites: number
}

type RawMember = { id: string; display_name: string; user_id: string; role: string; status: string; joined_at: string }

/** All ops members via SECURITY DEFINER admin_list_ops_members (is_active_ops()-gated). */
export async function getTeamMembers(supabase: Client): Promise<MemberRow[]> {
  const { data, error } = await supabase.rpc('admin_list_ops_members')
  if (error) throw error
  return ((data ?? []) as unknown as RawMember[]).map((m) => ({
    id: m.id,
    displayName: m.display_name,
    userId: m.user_id,
    role: m.role,
    status: m.status,
    joinedAt: m.joined_at,
  }))
}

/** Team overview: full member list + by-role counts + pending invite count. */
export async function getTeamOverview(supabase: Client): Promise<TeamOverview> {
  const members = await getTeamMembers(supabase)
  const byRole: Record<string, number> = { owner: 0, admin: 0, moderator: 0, analyst: 0 }
  for (const m of members) {
    if (m.role in byRole) byRole[m.role]++
  }
  const { count, error } = await supabase
    .from('kinnso_ops_invites')
    .select('id', { count: 'exact', head: true })
    .eq('status', 'pending')
  if (error) throw error
  return { members, byRole, pendingInvites: count ?? 0 }
}
