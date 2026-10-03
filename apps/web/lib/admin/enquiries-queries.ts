import type { Database } from '@kinnso/db'
import type { SupabaseClient } from '@supabase/supabase-js'
import type { EnquiryType } from '@/lib/enquiries/types'

export type EnquiryStatus = 'new' | 'in_progress' | 'resolved' | 'spam'
export type EnquiryStatusFilter = 'active' | 'resolved' | 'spam'
export type EnquiryTypeFilter = 'all' | EnquiryType

export interface AdminEnquiryCursor {
  createdAt: string
  id: string
}

export interface AdminEnquiry {
  id: string
  type: EnquiryType
  name: string
  email: string
  message: string
  status: EnquiryStatus
  createdAt: string
  updatedAt: string
  targetId: string | null
  targetName: string | null
  targetSlug: string | null
}

type EnquiryRpcRow = {
  id: string
  type: EnquiryType
  name: string
  email: string
  message: string
  status: EnquiryStatus
  created_at: string
  updated_at: string
  target_id: string | null
  target_name: string | null
  target_slug: string | null
}

export async function listAdminEnquiries(
  supabase: SupabaseClient<Database>,
  filters: { status: EnquiryStatusFilter; type: EnquiryTypeFilter },
  cursor: AdminEnquiryCursor | null = null,
): Promise<AdminEnquiry[]> {
  const { data, error } = await supabase.rpc('admin_list_enquiries', {
    p_status_group: filters.status,
    p_type: filters.type === 'all' ? undefined : filters.type,
    p_limit: 26,
    p_cursor_created_at: cursor?.createdAt,
    p_cursor_id: cursor?.id,
  })
  if (error) throw new Error('Unable to load enquiries')

  return ((data ?? []) as EnquiryRpcRow[]).map((row) => ({
    id: row.id,
    type: row.type,
    name: row.name,
    email: row.email,
    message: row.message,
    status: row.status,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    targetId: row.target_id,
    targetName: row.target_name,
    targetSlug: row.target_slug,
  }))
}
