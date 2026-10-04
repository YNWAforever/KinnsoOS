import { describe, it, expect } from 'vitest'
import { resolveRequest } from '@/lib/redirects/resolve'

const redirects = new Map([['/post/old-ramen', '/articles/dining/ramen-guide']])

describe('resolveRequest', () => {
  it('301s a localed legacy path to the localed target', () => {
    expect(resolveRequest('/zh-hk/post/old-ramen', redirects))
      .toEqual({ type: 'redirect', status: 301, location: '/zh-hk/articles/dining/ramen-guide' })
  })
  it('301s a non-localed legacy path to the default-locale target', () => {
    expect(resolveRequest('/post/old-ramen', redirects))
      .toEqual({ type: 'redirect', status: 301, location: '/en/articles/dining/ramen-guide' })
  })
  it('adds a missing locale prefix (locale guard) as a 307', () => {
    expect(resolveRequest('/articles/dining', redirects))
      .toEqual({ type: 'redirect', status: 307, location: '/en/articles/dining' })
  })
  it('passes through an already-localed non-redirect path', () => {
    expect(resolveRequest('/zh-hk/articles/dining/ramen-guide', redirects))
      .toEqual({ type: 'next' })
  })
  it('redirects bare / to the default locale', () => {
    expect(resolveRequest('/', redirects))
      .toEqual({ type: 'redirect', status: 307, location: '/en' })
  })
})
