import { describe, expect, it } from 'vitest'
import { normalizeEnquiryIp } from '@/lib/enquiries/attestation'

describe('normalizeEnquiryIp', () => {
  it('keeps the unspecified IPv6 address in PostgreSQL host(inet) form', () => {
    expect(normalizeEnquiryIp('::')).toBe('::')
  })
})
