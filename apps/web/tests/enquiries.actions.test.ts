import { beforeEach, describe, expect, it, vi } from 'vitest'

const { getClientIpMock, createSupabaseServerClientMock, createEnquiryAttestationMock, rpcMock } = vi.hoisted(() => ({
  getClientIpMock: vi.fn(async () => '203.000.113.009'),
  createSupabaseServerClientMock: vi.fn(),
  createEnquiryAttestationMock: vi.fn(async (): Promise<{ ip: string; header: string } | null> => ({
    ip: '203.0.113.9',
    header: 'v1.2000000000.' + 'a'.repeat(64),
  })),
  rpcMock: vi.fn(async (): Promise<{ data: string | null; error: { code: string; message: string } | null }> => ({ data: '33333333-3333-4333-8333-333333333333', error: null })),
}))

vi.mock('@/lib/http/client-ip', () => ({ getClientIp: getClientIpMock }))
vi.mock('@/lib/supabase/server', () => ({ createSupabaseServerClient: createSupabaseServerClientMock }))
vi.mock('@/lib/enquiries/attestation', () => ({ createEnquiryAttestation: createEnquiryAttestationMock }))

import { submitEnquiryAction } from '@/lib/enquiries/actions'

const CREATOR_ID = '11111111-1111-4111-8111-111111111111'
const MERCHANT_ID = '22222222-2222-4222-8222-222222222222'
const ENQUIRY_ID = '33333333-3333-4333-8333-333333333333'
const valid = {
  type: 'creator_collab' as const,
  targetId: CREATOR_ID,
  name: ' Ada Wong ',
  email: ' ADA@Example.COM ',
  message: ' I would like to discuss a campaign. ',
}

beforeEach(() => {
  getClientIpMock.mockReset()
  getClientIpMock.mockResolvedValue('203.000.113.009')
  createEnquiryAttestationMock.mockReset()
  createEnquiryAttestationMock.mockResolvedValue({ ip: '203.0.113.9', header: 'v1.2000000000.' + 'a'.repeat(64) })
  rpcMock.mockReset()
  rpcMock.mockResolvedValue({ data: ENQUIRY_ID, error: null })
  createSupabaseServerClientMock.mockReset()
  createSupabaseServerClientMock.mockResolvedValue({ rpc: rpcMock })
})

describe('submitEnquiryAction', () => {
  it('returns fake success before validation or every server dependency for a filled honeypot', async () => {
    await expect(submitEnquiryAction({ ...valid, website: 'spam.example' })).resolves.toEqual({ ok: true })

    expect(getClientIpMock).not.toHaveBeenCalled()
    expect(createEnquiryAttestationMock).not.toHaveBeenCalled()
    expect(createSupabaseServerClientMock).not.toHaveBeenCalled()
    expect(rpcMock).not.toHaveBeenCalled()
  })

  it('rejects invalid input before IP, secret attestation, client construction, or RPC work', async () => {
    await expect(submitEnquiryAction({ ...valid, email: 'not-an-email' })).resolves.toEqual({ ok: false, error: 'invalid' })

    expect(getClientIpMock).not.toHaveBeenCalled()
    expect(createEnquiryAttestationMock).not.toHaveBeenCalled()
    expect(createSupabaseServerClientMock).not.toHaveBeenCalled()
    expect(rpcMock).not.toHaveBeenCalled()
  })

  it('submits normalized creator values with a server-only attestation header', async () => {
    await expect(submitEnquiryAction(valid)).resolves.toEqual({ ok: true })

    expect(getClientIpMock).toHaveBeenCalledOnce()
    expect(createEnquiryAttestationMock).toHaveBeenCalledWith('203.000.113.009')
    expect(createSupabaseServerClientMock).toHaveBeenCalledWith({
      global: { headers: { 'x-kinnso-enquiry-attestation': 'v1.2000000000.' + 'a'.repeat(64) } },
    })
    expect(rpcMock).toHaveBeenCalledWith('submit_enquiry', {
      p_type: 'creator_collab',
      p_creator_id: CREATOR_ID,
      p_merchant_profile_id: null,
      p_name: 'Ada Wong',
      p_email: 'ada@example.com',
      p_message: 'I would like to discuss a campaign.',
      p_ip: '203.0.113.9',
      p_max_requests: 5,
      p_window_seconds: 3600,
    })
  })

  it('sends a merchant target only through p_merchant_profile_id', async () => {
    await expect(submitEnquiryAction({ ...valid, type: 'merchant_contact', targetId: MERCHANT_ID })).resolves.toEqual({ ok: true })

    expect(rpcMock).toHaveBeenCalledWith('submit_enquiry', expect.objectContaining({
      p_creator_id: null,
      p_merchant_profile_id: MERCHANT_ID,
    }))
  })

  it('fails closed without constructing a Supabase client when the secret cannot create an attestation', async () => {
    createEnquiryAttestationMock.mockResolvedValueOnce(null)
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => undefined)

    await expect(submitEnquiryAction(valid)).resolves.toEqual({ ok: false, error: 'failed' })

    expect(createSupabaseServerClientMock).not.toHaveBeenCalled()
    expect(rpcMock).not.toHaveBeenCalled()
    expect(errorSpy).toHaveBeenCalledWith('[enquiries] attestation_unavailable')
    errorSpy.mockRestore()
  })

  it('accepts a returned enquiry UUID as success', async () => {
    rpcMock.mockResolvedValueOnce({ data: ENQUIRY_ID, error: null })

    await expect(submitEnquiryAction(valid)).resolves.toEqual({ ok: true })
  })

  it('maps an eligibility-hidden null RPC result to generic failure without logging submitted PII', async () => {
    rpcMock.mockResolvedValueOnce({ data: null, error: null })
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => undefined)

    await expect(submitEnquiryAction(valid)).resolves.toEqual({ ok: false, error: 'failed' })

    expect(errorSpy).toHaveBeenCalledWith('[enquiries] submission_failed')
    const logs = JSON.stringify(errorSpy.mock.calls)
    expect(logs).not.toContain('Ada Wong')
    expect(logs).not.toContain('ada@example.com')
    expect(logs).not.toContain('campaign')
    errorSpy.mockRestore()
  })

  it('maps the database rate-limit code to a safe rate_limited result', async () => {
    rpcMock.mockResolvedValueOnce({ data: null, error: { code: '22023', message: 'enquiry_rate_limited' } })

    await expect(submitEnquiryAction(valid)).resolves.toEqual({ ok: false, error: 'rate_limited' })
  })

  it('maps unexpected database errors to failed without logging submitted PII', async () => {
    rpcMock.mockResolvedValueOnce({ data: null, error: { code: 'XX000', message: 'Ada Wong ada@example.com campaign details' } })
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => undefined)

    await expect(submitEnquiryAction(valid)).resolves.toEqual({ ok: false, error: 'failed' })

    expect(errorSpy).toHaveBeenCalledWith('[enquiries] submission_failed')
    expect(JSON.stringify(errorSpy.mock.calls)).not.toContain('Ada Wong')
    expect(JSON.stringify(errorSpy.mock.calls)).not.toContain('ada@example.com')
    errorSpy.mockRestore()
  })
})
