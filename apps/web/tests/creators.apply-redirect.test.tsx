import { beforeEach, describe, expect, it, vi } from 'vitest'
import { redirect } from 'next/navigation'

vi.mock('next/navigation', () => ({ redirect: vi.fn() }))

import CreatorApplyPage from '@/app/[locale]/creators/apply/page'

beforeEach(() => {
  vi.clearAllMocks()
})

describe('/[locale]/creators/apply', () => {
  it('redirects to the apply funnel entry /sign-up', async () => {
    await CreatorApplyPage({ params: Promise.resolve({ locale: 'en' }) })
    expect(redirect).toHaveBeenCalledWith('/en/sign-up')
  })

  it('falls back to en for an unknown locale', async () => {
    await CreatorApplyPage({ params: Promise.resolve({ locale: 'zz' }) })
    expect(redirect).toHaveBeenCalledWith('/en/sign-up')
  })
})
