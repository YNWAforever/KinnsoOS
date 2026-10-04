'use server'

import 'server-only'

import { createEnquiryAttestation } from '@/lib/enquiries/attestation'
import { getClientIp } from '@/lib/http/client-ip'
import { createSupabaseServerClient } from '@/lib/supabase/server'
import { ENQUIRY_RATE_LIMIT, type EnquiryInput, type EnquiryResult } from './types'
import { isValidEnquiryTargetId, validateEnquiryInput } from './validation'


export async function submitEnquiryAction(input: EnquiryInput): Promise<EnquiryResult> {
  if (input.website) return { ok: true }
  const parsed = validateEnquiryInput(input)
  if (!parsed.ok) return { ok: false, error: 'invalid' }

  try {
    const ip = await getClientIp()
    const attestation = await createEnquiryAttestation(ip)
    if (!attestation) {
      console.error('[enquiries] attestation_unavailable')
      return { ok: false, error: 'failed' }
    }
    const supabase = await createSupabaseServerClient({
      global: { headers: { 'x-kinnso-enquiry-attestation': attestation.header } },
    })
    const isCreator = parsed.value.type === 'creator_collab'
    const { data, error } = await supabase.rpc('submit_enquiry', {
      p_type: parsed.value.type,
      // Supabase's generated RPC types currently model nullable SQL function
      // arguments as required strings, although this RPC's XOR contract
      // deliberately sends one SQL NULL target ID.
      p_creator_id: (isCreator ? parsed.value.targetId : null) as unknown as string,
      p_merchant_profile_id: (isCreator ? null : parsed.value.targetId) as unknown as string,
      p_name: parsed.value.name,
      p_email: parsed.value.email,
      p_message: parsed.value.message,
      p_ip: attestation.ip,
      p_max_requests: ENQUIRY_RATE_LIMIT.maxRequests,
      p_window_seconds: ENQUIRY_RATE_LIMIT.windowSeconds,
    })
    if (!error && isValidEnquiryTargetId(data)) return { ok: true }
    if (error?.message.includes('enquiry_rate_limited')) return { ok: false, error: 'rate_limited' }
    console.error('[enquiries] submission_failed')
    return { ok: false, error: 'failed' }
  } catch {
    console.error('[enquiries] submission_failed')
    return { ok: false, error: 'failed' }
  }
}
