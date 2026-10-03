import type { SupabaseClient } from '@supabase/supabase-js'
import type { Database } from '@kinnso/db'

type Client = SupabaseClient<Database>

export interface CopilotMessageRow {
  id: string
  role: 'user' | 'assistant'
  content: string
  created_at: string
}

/** The creator's active (non-archived) thread: the most-recent `limit` messages,
 *  returned oldest-first for chronological display. */
export async function getRecentMessages(supabase: Client, creatorId: string, limit = 50): Promise<CopilotMessageRow[]> {
  const { data } = await supabase
    .from('copilot_messages')
    .select('id, role, content, created_at')
    .eq('creator_id', creatorId)
    .eq('archived', false)
    .order('created_at', { ascending: false })
    .limit(limit)
  // Display oldest-first. `id` is a random uuid (gen_random_uuid), so it is NOT a usable
  // chronological tie-break; for rows sharing a created_at, place the user prompt before
  // its assistant reply (the user row is always written first, before the stream starts).
  const rows = (data ?? []) as CopilotMessageRow[]
  return rows.sort((a, b) => {
    if (a.created_at !== b.created_at) return a.created_at < b.created_at ? -1 : 1
    if (a.role === b.role) return 0
    return a.role === 'user' ? -1 : 1
  })
}

export async function appendMessage(
  supabase: Client,
  creatorId: string,
  role: 'user' | 'assistant',
  content: string,
  toolCalls?: unknown,
): Promise<void> {
  const { error } = await supabase.from('copilot_messages').insert({
    creator_id: creatorId,
    role,
    content,
    tool_calls: (toolCalls as never) ?? null,
  })
  if (error) throw new Error(`appendMessage failed: ${error.message}`)
}

/** Count this creator's USER messages since UTC midnight (the daily rate-limit window).
 *  Counts ALL user rows regardless of archived state: the daily cap is an abuse/cost
 *  ceiling that MUST survive a "New chat" (which archives the active thread). Filtering
 *  by archived here would let a creator reset their quota by starting a new chat. */
export async function countUserMessagesToday(supabase: Client, creatorId: string): Promise<number> {
  const now = new Date()
  const startIso = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate())).toISOString()
  const { count } = await supabase
    .from('copilot_messages')
    .select('id', { count: 'exact', head: true })
    .eq('creator_id', creatorId)
    .eq('role', 'user')
    .gte('created_at', startIso)
  return count ?? 0
}

/** Start a "New chat": archive the creator's current active thread (history is kept). */
export async function archiveThread(supabase: Client, creatorId: string): Promise<void> {
  const { error } = await supabase
    .from('copilot_messages')
    .update({ archived: true })
    .eq('creator_id', creatorId)
    .eq('archived', false)
  if (error) throw new Error(`archiveThread failed: ${error.message}`)
}
