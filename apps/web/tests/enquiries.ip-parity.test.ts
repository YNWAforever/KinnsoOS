import { describe, expect, it } from 'vitest'
import { normalizeEnquiryIp } from '@/lib/enquiries/attestation'

describe('normalizeEnquiryIp PostgreSQL host(inet) parity', () => {
  it.each([
    ['IPv4 CIDR', '203.000.113.009/24', '203.0.113.9'],
    ['IPv6 CIDR', '2001:0db8:0:0:0:0:2:1/64', '2001:db8::2:1'],
    ['IPv4-compatible dotted IPv6', '::192.0.2.128', '::192.0.2.128'],
    ['IPv4-compatible hexadecimal IPv6', '::c000:0280', '::192.0.2.128'],
    ['IPv4-mapped IPv6 CIDR', '::ffff:192.0.2.128/128', '::ffff:192.0.2.128'],
  ])('normalizes %s exactly like PostgreSQL host(inet)', (_label, input, expected) => {
    expect(normalizeEnquiryIp(input)).toBe(expected)
  })
})
