import { revalidatePath } from 'next/cache'
import { requireOpsAction } from '@/lib/admin/guard'
import { formError, type ActionResult } from '@/lib/admin/result'
import { isLocale, type Locale } from '@/lib/i18n/config'
import { createSupabaseServerClient } from '@/lib/supabase/server'
import type { EnquiryStatus } from './enquiries-queries'

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i

function isEnquiryStatus(value: string): value is EnquiryStatus {
  return value === 'new' || value === 'in_progress' || value === 'resolved' || value === 'spam'
}

export async function setEnquiryStatusAction(
  locale: Locale,
  id: string,
  status: EnquiryStatus,
  reason: string,
): Promise<ActionResult<{ status: EnquiryStatus }>> {
  'use server'
  const supabase = await createSupabaseServerClient()
  const gate = await requireOpsAction(supabase)
  if (!gate.ok) return gate
  if (!isLocale(locale) || !UUID.test(id) || !isEnquiryStatus(status) || typeof reason !== 'string') {
    return formError('Invalid enquiry update')
  }

  const trimmedReason = reason.trim()
  if ((status === 'resolved' || status === 'spam') && !trimmedReason) return formError('A reason is required')
  if (trimmedReason.length > 500) return formError('Reason is too long')

  const { error } = await supabase.rpc('admin_set_enquiry_status', {
    p_id: id,
    p_status: status,
    p_reason: trimmedReason || undefined,
  })
  if (error) {
    console.error('[admin:enquiries] status change failed', { code: error.code ?? 'unknown' })
    return formError('Enquiry status could not be changed')
  }

  revalidatePath(`/${locale}/admin/enquiries`)
  return { ok: true, status }
}
