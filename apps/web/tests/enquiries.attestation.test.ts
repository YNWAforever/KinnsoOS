import { createHmac } from 'node:crypto'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { createEnquiryAttestation } from '@/lib/enquiries/attestation'

const now = 1_700_000_000_000

afterEach(() => {
  vi.unstubAllEnvs()
})

describe('createEnquiryAttestation', () => {
  it('uses the exact PostgreSQL host(inet) canonical IP in a short-lived HMAC', () => {
    vi.stubEnv('ENQUIRY_SUBMISSION_SECRET', 'test-secret')
    const expiry = Math.floor(now / 1000) + 120
    const hmac = createHmac('sha256', 'test-secret').update(`2001:db8::2:1\n${expiry}`).digest('hex')

    expect(createEnquiryAttestation(' 2001:0db8:0:0:0:0:2:1 ', now)).toEqual({
      ip: '2001:db8::2:1',
      header: `v1.${expiry}.${hmac}`,
    })
  })

  it('normalizes IPv4 leading zeroes and IPv4-mapped IPv6 exactly as PostgreSQL host(inet)', () => {
    vi.stubEnv('ENQUIRY_SUBMISSION_SECRET', 'test-secret')

    expect(createEnquiryAttestation('203.000.113.009', now)?.ip).toBe('203.0.113.9')
    expect(createEnquiryAttestation('0:0:0:0:0:ffff:c000:0280', now)?.ip).toBe('::ffff:192.0.2.128')
  })

  it('fails closed for a missing or blank secret and invalid database IP', () => {
    vi.stubEnv('ENQUIRY_SUBMISSION_SECRET', '')
    expect(createEnquiryAttestation('203.0.113.9', now)).toBeNull()

    vi.stubEnv('ENQUIRY_SUBMISSION_SECRET', 'test-secret')
    expect(createEnquiryAttestation('unknown', now)).toBeNull()
  })
})
