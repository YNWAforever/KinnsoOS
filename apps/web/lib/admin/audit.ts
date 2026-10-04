import type { SupabaseClient } from '@supabase/supabase-js'
import type { Database } from '@kinnso/db'

type Client = SupabaseClient<Database>

export interface AuditEntry {
  id: string
  entityType: string
  entityId: string
  action: string
  reason: string | null
  metadata: Record<string, unknown>
  createdAt: string
}

type AuditRow = {
  id: string
  entity_type: string
  entity_id: string
  action: string
  reason: string | null
  metadata: Record<string, unknown> | null
  created_at: string
}

const toEntry = (r: AuditRow): AuditEntry => ({
  id: r.id,
  entityType: r.entity_type,
  entityId: r.entity_id,
  action: r.action,
  reason: r.reason,
  metadata: r.metadata ?? {},
  createdAt: r.created_at,
})

const COLS = 'id, entity_type, entity_id, action, reason, metadata, created_at'

/** Audit entries for one entity, newest first. Errors propagate. */
export async function listAudit(
  supabase: Client,
  entityType: string,
  entityId: string,
  limit = 50,
): Promise<AuditEntry[]> {
  const { data, error } = await supabase
    .from('ops_audit_log')
    .select(COLS)
    .eq('entity_type', entityType)
    .eq('entity_id', entityId)
    .order('created_at', { ascending: false })
    .limit(limit)
  if (error) throw error
  return ((data ?? []) as AuditRow[]).map(toEntry)
}

/** Recent audit entries across all entities of a type (the Overview feed). */
export async function listRecentAudit(
  supabase: Client,
  entityType: string,
  limit = 20,
): Promise<AuditEntry[]> {
  const { data, error } = await supabase
    .from('ops_audit_log')
    .select(COLS)
    .eq('entity_type', entityType)
    .order('created_at', { ascending: false })
    .limit(limit)
  if (error) throw error
  return ((data ?? []) as AuditRow[]).map(toEntry)
}
