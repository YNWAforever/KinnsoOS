import type { SupabaseClient } from '@supabase/supabase-js'
import type { Database } from '@kinnso/db'

type Client = SupabaseClient<Database>

/** Exactly one of travelerUserId/anonSessionId must be set — mirrors
 *  agent_messages' own mutually-exclusive-identity CHECK constraint. */
export type AgentIdentity = { travelerUserId: string; anonSessionId?: never } | { travelerUserId?: never; anonSessionId: string }

export interface AgentMessageRow {
  id: string
  role: 'user' | 'assistant'
  content: string
  created_at: string
}

/** A signed-in traveller's saved conversation, oldest-first for chronological display
 *  (D-R4-4 / plan Ground Truth: "sign-in unlocks reading a traveller's saved
 *  conversation history back"). Mirrors copilot's getRecentMessages exactly, but there
 *  is no anon equivalent: agent_messages_owner_select only grants SELECT to
 *  `authenticated` rows matching `traveler_user_id = auth.uid()` — anon sessions are
 *  insert-only by design (no anon_session_id SELECT policy exists at all), so this
 *  function is only ever called for a signed-in travelerUserId. */
export async function getAgentMessages(supabase: Client, travelerUserId: string, limit = 50): Promise<AgentMessageRow[]> {
  const { data } = await supabase
    .from('agent_messages')
    .select('id, role, content, created_at')
    .eq('traveler_user_id', travelerUserId)
    .order('created_at', { ascending: false })
    .limit(limit)
  // Display oldest-first. `id` is a random uuid (gen_random_uuid), so it is NOT a usable
  // chronological tie-break; for rows sharing a created_at, place the user prompt before
  // its assistant reply (the user row is always written first, before the stream starts) —
  // same tie-break rationale as copilot's getRecentMessages.
  const rows = (data ?? []) as AgentMessageRow[]
  return rows.sort((a, b) => {
    if (a.created_at !== b.created_at) return a.created_at < b.created_at ? -1 : 1
    if (a.role === b.role) return 0
    return a.role === 'user' ? -1 : 1
  })
}

export async function appendAgentMessage(
  supabase: Client,
  identity: AgentIdentity,
  role: 'user' | 'assistant',
  content: string,
  toolCalls?: unknown,
): Promise<void> {
  const { error } = await supabase.from('agent_messages').insert({
    traveler_user_id: identity.travelerUserId ?? null,
    anon_session_id: identity.anonSessionId ?? null,
    role,
    content,
    tool_calls: (toolCalls as never) ?? null,
  })
  if (error) throw new Error(`appendAgentMessage failed: ${error.message}`)
}
