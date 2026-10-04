import { describe, it, expect, vi, beforeEach } from 'vitest'
import { NextRequest, NextResponse } from 'next/server'
import { safeNext } from '@/lib/auth/safe-next'

/**
 * `proxy.ts` had no test of its own — `auth.middleware.test.ts` covers
 * `lib/supabase/middleware.ts` (updateSession), not the proxy that consumes it.
 * The auth-gate branch is worth pinning because it is the only place the gate's
 * decision becomes an actual `Location` header, and because the obvious way to
 * write it is wrong: assigning a string containing "?" to `url.pathname`
 * percent-escapes the "?" into the path and produces a 404 rather than a
 * redirect carrying `?next=`.
 */

const { mockUser } = vi.hoisted(() => ({ mockUser: { current: null as { id: string } | null } }))

vi.mock('@/lib/supabase/middleware', () => ({
  updateSession: async () => {
    const response = NextResponse.next() as NextResponse & { user: { id: string } | null }
    response.user = mockUser.current
    return response
  },
}))

// No seo_redirects lookup in these cases: a locale-prefixed path resolves to 'next'.
vi.mock('@/lib/redirects/resolve', () => ({
  resolveRequest: () => ({ type: 'next' as const }),
}))

const { proxy } = await import('@/proxy')

const request = (url: string) => new NextRequest(new URL(url, 'https://kinnso.test'))

beforeEach(() => {
  mockUser.current = null
})

describe('proxy auth gate', () => {
  it('redirects an anonymous viewer and carries the blocked path as next', async () => {
    const response = await proxy(request('/en/trips'))

    expect(response.status).toBe(307)
    const location = new URL(response.headers.get('location') as string)
    expect(location.pathname).toBe('/en/sign-in')
    expect(location.searchParams.get('next')).toBe('/en/trips')
  })

  it('preserves the blocked query string inside next rather than discarding it', async () => {
    const response = await proxy(request('/en/trips?tab=saved&page=2'))

    const location = new URL(response.headers.get('location') as string)
    // The regression this guards: proxy.ts used to set `url.search = ''`.
    expect(location.searchParams.get('next')).toBe('/en/trips?tab=saved&page=2')
  })

  it('emits a Location the sign-in page will actually accept', async () => {
    const response = await proxy(request('/zh-hk/admin/users?page=3'))

    const location = new URL(response.headers.get('location') as string)
    expect(location.pathname).toBe('/zh-hk/sign-in')
    // Round trip through the consumer, exactly as the sign-in page does.
    expect(safeNext(location.searchParams.get('next') ?? undefined, 'zh-hk'))
      .toBe('/zh-hk/admin/users?page=3')
  })

  it('does not escape the query separator into the path', async () => {
    const response = await proxy(request('/en/trips?tab=saved'))

    const raw = response.headers.get('location') as string
    // `url.pathname = '/en/sign-in?next=...'` would yield '/en/sign-in%3Fnext=...'
    expect(raw).not.toContain('%3Fnext')
    expect(new URL(raw).pathname).toBe('/en/sign-in')
  })

  it('lets a signed-in viewer through a gated path untouched', async () => {
    mockUser.current = { id: 'u1' }
    const response = await proxy(request('/en/trips'))

    expect(response.headers.get('location')).toBeNull()
  })

  it('leaves a public path alone for an anonymous viewer', async () => {
    const response = await proxy(request('/en/articles'))

    expect(response.headers.get('location')).toBeNull()
  })
})
