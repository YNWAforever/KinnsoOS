// apps/web/tests/merchants.post.host.test.tsx
// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

/**
 * /merchants/dashboard/post previously had no page gate at all — only an
 * `isLocale` check — and no test of any kind.
 *
 * That was never privilege escalation: the proxy gates the /merchants/dashboard
 * prefix for anonymous visitors, and createMissionAction re-derives authority
 * server-side. But any signed-in traveller or creator was served the merchant
 * brief wizard and only found out it was not for them at submit time.
 */
const { merchantPageGateMock } = vi.hoisted(() => ({
  merchantPageGateMock: vi.fn(async () => ({ user: { id: 'u1' }, merchantId: 'm1' })),
}))
vi.mock('next/navigation', () => ({
  notFound: () => { throw new Error('NEXT_NOT_FOUND') },
  redirect: (p: string) => { throw new Error(`NEXT_REDIRECT:${p}`) },
}))
vi.mock('@/lib/admin/guard', () => ({ requireMerchantPage: merchantPageGateMock }))
vi.mock('@/lib/supabase/server', () => ({ createSupabaseServerClient: async () => ({}) }))
vi.mock('@/components/kinnso/pages/MissionPostWizard', () => ({
  MissionPostWizard: () => <div data-testid="mission-post-wizard" />,
}))

import MerchantPostPage from '@/app/[locale]/merchants/dashboard/post/page'

beforeEach(() => {
  merchantPageGateMock.mockResolvedValue({ user: { id: 'u1' }, merchantId: 'm1' })
})
afterEach(() => vi.clearAllMocks())

describe('/merchants/dashboard/post host', () => {
  it('redirects an anonymous viewer to sign-in', async () => {
    merchantPageGateMock.mockRejectedValueOnce(new Error('NEXT_REDIRECT:/en/sign-in'))
    await expect(MerchantPostPage({ params: Promise.resolve({ locale: 'en' }) }))
      .rejects.toThrow('NEXT_REDIRECT:/en/sign-in')
  })

  it('404s a signed-in non-merchant rather than serving the brief wizard', async () => {
    merchantPageGateMock.mockRejectedValueOnce(new Error('NEXT_NOT_FOUND'))
    await expect(MerchantPostPage({ params: Promise.resolve({ locale: 'en' }) }))
      .rejects.toThrow('NEXT_NOT_FOUND')
  })

  it('gates before rendering — the wizard is never constructed for a denied viewer', async () => {
    merchantPageGateMock.mockRejectedValueOnce(new Error('NEXT_NOT_FOUND'))
    await expect(MerchantPostPage({ params: Promise.resolve({ locale: 'en' }) })).rejects.toThrow()
    expect(merchantPageGateMock).toHaveBeenCalledOnce()
  })

  it('renders the wizard for a merchant', async () => {
    const ui = await MerchantPostPage({ params: Promise.resolve({ locale: 'en' }) })
    expect(ui).toBeTruthy()
    expect(merchantPageGateMock).toHaveBeenCalledWith(expect.anything(), 'en')
  })

  it('rejects an unknown locale before touching auth', async () => {
    await expect(MerchantPostPage({ params: Promise.resolve({ locale: 'klingon' }) }))
      .rejects.toThrow('NEXT_NOT_FOUND')
    expect(merchantPageGateMock).not.toHaveBeenCalled()
  })
})
