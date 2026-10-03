import type { SupabaseClient } from '@supabase/supabase-js'
import type { Database } from '@kinnso/db'

type Client = SupabaseClient<Database>

export type NotificationRow = {
  id: string
  notificationType: string
  entityType: string
  entityId: string
  payload: Record<string, unknown>
  readAt: string | null
  createdAt: string
}

/** The caller's own notifications, newest first, capped at 50. Errors propagate. */
export async function getNotifications(supabase: Client): Promise<NotificationRow[]> {
  const { data, error } = await supabase.rpc('notifications_mine')
  if (error) throw error
  return (data ?? []) as unknown as NotificationRow[]
}

/** The caller's own unread count. Errors propagate. */
export async function getUnreadNotificationCount(supabase: Client): Promise<number> {
  const { data, error } = await supabase.rpc('notifications_unread_count')
  if (error) throw error
  return (data as number | null) ?? 0
}
