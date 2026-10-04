import type { EnquiryType, NormalizedEnquiryInput } from './types'

const EMAIL_RE = /^[^@\s]+@[^@\s]+\.[^@\s]+$/
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i

export function isValidEnquiryTargetId(value: unknown): value is string {
  return typeof value === 'string' && UUID_RE.test(value)
}

function isEnquiryType(value: unknown): value is EnquiryType {
  return value === 'creator_collab' || value === 'merchant_contact'
}

export function validateEnquiryInput(input: unknown): { ok: true; value: NormalizedEnquiryInput } | { ok: false } {
  if (!input || typeof input !== 'object') return { ok: false }
  const value = input as Record<string, unknown>
  if (!isEnquiryType(value.type) || !isValidEnquiryTargetId(value.targetId)) return { ok: false }
  if (typeof value.name !== 'string' || typeof value.email !== 'string' || typeof value.message !== 'string') return { ok: false }

  const name = value.name.trim()
  const email = value.email.trim().toLowerCase()
  const message = value.message.trim()
  if (name.length < 1 || name.length > 120 || email.length > 254 || !EMAIL_RE.test(email) || message.length < 10 || message.length > 4000) return { ok: false }

  return { ok: true, value: { type: value.type, targetId: value.targetId, name, email, message } }
}
