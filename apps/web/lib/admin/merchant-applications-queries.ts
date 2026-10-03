import type { SupabaseClient } from '@supabase/supabase-js'
import type { Database } from '@kinnso/db'

export type AdminMerchantApplication = {
  id: string
  userId: string
  companyName: string
  contactName: string | null
  contactEmail: string
  websiteUrl: string | null
  pitch: string | null
  status: 'pending' | 'approved' | 'rejected'
  decidedAt: string | null
  decisionReason: string | null
  createdAt: string
}

type Row = {
  id: string; user_id: string; company_name: string; contact_name: string | null; contact_email: string
  website_url: string | null; pitch: string | null; status: string
  decided_at: string | null; decision_reason: string | null; created_at: string
}

function toDomain(r: Row): AdminMerchantApplication {
  return {
    id: r.id,
    userId: r.user_id,
    companyName: r.company_name,
    contactName: r.contact_name,
    contactEmail: r.contact_email,
    websiteUrl: r.website_url,
    pitch: r.pitch,
    status: r.status as AdminMerchantApplication['status'],
    decidedAt: r.decided_at,
    decisionReason: r.decision_reason,
    createdAt: r.created_at,
  }
}

const COLUMNS = 'id, user_id, company_name, contact_name, contact_email, website_url, pitch, status, decided_at, decision_reason, created_at'

/** Ops-only read (RLS: merchant_applications_ops_select); only ever called behind requireOpsPage. */
export async function listPendingMerchantApplications(
  supabase: SupabaseClient<Database>,
): Promise<AdminMerchantApplication[]> {
  const { data, error } = await supabase
    .from('merchant_applications')
    .select(COLUMNS)
    .eq('status', 'pending')
    .order('created_at', { ascending: true })
  if (error) throw error
  return (data ?? []).map((r) => toDomain(r as unknown as Row))
}

/** Ops-only read of the last 50 decided applications, newest decision first. */
export async function listDecidedMerchantApplications(
  supabase: SupabaseClient<Database>,
): Promise<AdminMerchantApplication[]> {
  const { data, error } = await supabase
    .from('merchant_applications')
    .select(COLUMNS)
    .in('status', ['approved', 'rejected'])
    .order('decided_at', { ascending: false })
    .limit(50)
  if (error) throw error
  return (data ?? []).map((r) => toDomain(r as unknown as Row))
}
