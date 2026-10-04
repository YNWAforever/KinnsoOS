// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest'

const { redirectMock, notFoundMock } = vi.hoisted(() => ({
  redirectMock: vi.fn((url: string) => {
    throw new Error(`NEXT_REDIRECT:${url}`)
  }),
  notFoundMock: vi.fn(() => {
    throw new Error('NEXT_NOT_FOUND')
  }),
}))

vi.mock('next/navigation', () => ({
  redirect: redirectMock,
  notFound: notFoundMock,
}))

import FeedPage from '@/app/[locale]/feed/page'

afterEach(() => {
  redirectMock.mockClear()
  notFoundMock.mockClear()
})

describe('/[locale]/feed host', () => {
  it('redirects to the canonical /explore route, locale-prefixed', async () => {
    await expect(
      FeedPage({ params: Promise.resolve({ locale: 'en' }) }),
    ).rejects.toThrow('NEXT_REDIRECT:/en/explore')
    expect(redirectMock).toHaveBeenCalledWith('/en/explore')
  })

  it('404s an unknown locale', async () => {
    await expect(
      FeedPage({ params: Promise.resolve({ locale: 'zz' }) }),
    ).rejects.toThrow('NEXT_NOT_FOUND')
  })
})
