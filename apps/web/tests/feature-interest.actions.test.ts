import { beforeEach, describe, expect, it, vi } from 'vitest'

const { rpcMock } = vi.hoisted(() => ({
  rpcMock: vi.fn(),
}))

vi.mock('@/lib/supabase/public', () => ({
  createSupabasePublicClient: () => ({ rpc: rpcMock }),
}))

import { joinFeatureInterestAction } from '@/lib/feature-interest/actions'

beforeEach(() => {
  rpcMock.mockReset()
  rpcMock.mockResolvedValue({ data: true, error: null })
})

describe('joinFeatureInterestAction', () => {
  it('normalizes a valid email and invokes the audited RPC', async () => {
    const result = await joinFeatureInterestAction({
      feature: 'agent',
      email: '  Traveller@Example.com ',
      locale: 'en',
      company: '',
    })

    expect(result).toEqual({ ok: true })
    expect(rpcMock).toHaveBeenCalledWith('join_feature_interest', {
      p_feature: 'agent',
      p_email: 'traveller@example.com',
      p_locale: 'en',
    })
  })

  it('rejects an invalid email before invoking the RPC', async () => {
    const result = await joinFeatureInterestAction({
      feature: 'booking',
      email: 'not-an-email',
      locale: 'en',
      company: '',
    })

    expect(result).toEqual({ ok: false, code: 'invalid-email' })
    expect(rpcMock).not.toHaveBeenCalled()
  })

  it.each([
    { feature: 'creator-copilot', locale: 'en' },
    { feature: 'agent', locale: 'xx' },
  ])('rejects invalid feature or locale input without invoking the RPC', async ({ feature, locale }) => {
    const result = await joinFeatureInterestAction({
      feature,
      email: 'traveller@example.com',
      locale,
      company: '',
    } as never)

    expect(result).toEqual({ ok: false, code: 'retry' })
    expect(rpcMock).not.toHaveBeenCalled()
  })

  it('returns a fake success without invoking the RPC when the honeypot is filled', async () => {
    const result = await joinFeatureInterestAction({
      feature: 'sessions',
      email: 'bot@example.com',
      locale: 'en',
      company: 'bot-filled',
    })

    expect(result).toEqual({ ok: true })
    expect(rpcMock).not.toHaveBeenCalled()
  })

  it('treats duplicate-safe RPC completion as success', async () => {
    rpcMock.mockResolvedValueOnce({ data: true, error: null })

    await expect(joinFeatureInterestAction({
      feature: 'booking',
      email: 'traveller@example.com',
      locale: 'zh-hk',
      company: '',
    })).resolves.toEqual({ ok: true })
  })

  it('returns a stable retry code without exposing an RPC failure', async () => {
    const rawMessage = 'relation feature_interest_signups does not exist'
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined)
    rpcMock.mockResolvedValueOnce({ data: null, error: { message: rawMessage } })

    const result = await joinFeatureInterestAction({
      feature: 'agent',
      email: 'traveller@example.com',
      locale: 'en',
      company: '',
    })

    expect(result).toEqual({ ok: false, code: 'retry' })
    expect(JSON.stringify(result)).not.toContain(rawMessage)
    expect(warn).toHaveBeenCalledWith('feature-interest-rpc-failed')
    expect(JSON.stringify(warn.mock.calls)).not.toContain(rawMessage)
    warn.mockRestore()
  })
})
