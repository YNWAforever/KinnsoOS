import type { SupabaseClient } from '@supabase/supabase-js'
import type { Database } from '@kinnso/db'

export type MyMerchantApplication = {
  id: string
  status: 'pending' | 'approved' | 'rejected'
  companyName: string
  decisionReason: string | null
  createdAt: string
}

/**
 * The caller's single most recent application (owner-RLS scoped). A user can re-apply
 * after a rejection, so this is the LATEST row, not "any row" — an old rejected row must
 * never mask a fresh pending one. Errors propagate (no silent null on a real failure).
 */
export async function getMyMerchantApplication(
  supabase: SupabaseClient<Database>,
  userId: string,
): Promise<MyMerchantApplication | null> {
  const { data, error } = await supabase
    .from('merchant_applications')
    .select('id, status, company_name, decision_reason, created_at')
    .eq('user_id', userId)
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle()
  if (error) throw error
  if (!data) return null
  return {
    id: data.id as string,
    status: data.status as MyMerchantApplication['status'],
    companyName: data.company_name as string,
    decisionReason: data.decision_reason as string | null,
    createdAt: data.created_at as string,
  }
}
