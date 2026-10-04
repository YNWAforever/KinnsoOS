// @vitest-environment jsdom
import { describe, expect, it, vi } from 'vitest'

vi.mock('next/navigation', () => ({
  redirect: vi.fn((path: string) => { throw new Error(`NEXT_REDIRECT:${path}`) }),
  notFound: vi.fn(() => { throw new Error('NEXT_NOT_FOUND') }),
}))

import OpsSettlementsPage from '@/app/[locale]/ops/settlements/page'

describe('/[locale]/ops/settlements legacy redirect', () => {
  it('redirects to the current payouts home, preserving locale', async () => {
    await expect(
      OpsSettlementsPage({ params: Promise.resolve({ locale: 'zh-hk' }) }),
    ).rejects.toThrow('NEXT_REDIRECT:/zh-hk/admin/creators/payouts')
  })

  it('404s for an unrecognised locale', async () => {
    await expect(
      OpsSettlementsPage({ params: Promise.resolve({ locale: 'xx' }) }),
    ).rejects.toThrow('NEXT_NOT_FOUND')
  })
})
