export type EnquiryType = 'creator_collab' | 'merchant_contact'

export type EnquiryResult =
  | { ok: true }
  | { ok: false; error: 'invalid' | 'rate_limited' | 'failed' }

export interface EnquiryInput {
  type: EnquiryType
  targetId: string
  name: string
  email: string
  message: string
  website?: string
}

export interface NormalizedEnquiryInput {
  type: EnquiryType
  targetId: string
  name: string
  email: string
  message: string
}

export const ENQUIRY_RATE_LIMIT = { maxRequests: 5, windowSeconds: 3600 } as const
