import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const { getClientIpMock, createSupabaseServerClientMock, createEnquiryAttestationMock, rpcMock } = vi.hoisted(() => ({
  getClientIpMock: vi.fn(async () => '203.0.113.9'),
  createSupabaseServerClientMock: vi.fn(),
  createEnquiryAttestationMock: vi.fn(async () => ({ ip: '203.0.113.9', header: 'v1.2000000000.' + 'b'.repeat(64) })),
  rpcMock: vi.fn(async () => ({ data: '33333333-3333-4333-8333-333333333333', error: null })),
}))

vi.mock('@/lib/http/client-ip', () => ({ getClientIp: getClientIpMock }))
vi.mock('@/lib/supabase/server', () => ({ createSupabaseServerClient: createSupabaseServerClientMock }))
vi.mock('@/lib/enquiries/attestation', () => ({ createEnquiryAttestation: createEnquiryAttestationMock }))

import { submitEnquiryAction } from '@/lib/enquiries/actions'

const valid = {
  type: 'creator_collab' as const,
  targetId: '11111111-1111-4111-8111-111111111111',
  name: 'Ada Wong',
  email: 'ada@example.com',
  message: 'I would like to discuss a campaign.',
}

beforeEach(() => {
  getClientIpMock.mockClear()
  createEnquiryAttestationMock.mockClear()
  rpcMock.mockClear()
  createSupabaseServerClientMock.mockClear()
  createSupabaseServerClientMock.mockResolvedValue({ rpc: rpcMock })
})

describe('enquiry service ordering and build boundary', () => {
  it('creates the request-scoped client only after IP resolution and attestation', async () => {
    await expect(submitEnquiryAction(valid)).resolves.toEqual({ ok: true })

    expect(getClientIpMock.mock.invocationCallOrder[0]).toBeLessThan(createEnquiryAttestationMock.mock.invocationCallOrder[0])
    expect(createEnquiryAttestationMock.mock.invocationCallOrder[0]).toBeLessThan(createSupabaseServerClientMock.mock.invocationCallOrder[0])
    expect(createSupabaseServerClientMock.mock.invocationCallOrder[0]).toBeLessThan(rpcMock.mock.invocationCallOrder[0])
  })

  it('marks attestation and action modules server-only without embedding a secret', () => {
    const actions = readFileSync(resolve(process.cwd(), 'lib/enquiries/actions.ts'), 'utf8')
    const attestation = readFileSync(resolve(process.cwd(), 'lib/enquiries/attestation.ts'), 'utf8')

    expect(actions).toMatch(/^import 'server-only'/m)
    expect(attestation).toMatch(/^import 'server-only'/m)
    expect(attestation).toContain('ENQUIRY_SUBMISSION_SECRET')
    expect(attestation).not.toMatch(/ENQUIRY_SUBMISSION_SECRET\s*=\s*['"]/)
  })
})
