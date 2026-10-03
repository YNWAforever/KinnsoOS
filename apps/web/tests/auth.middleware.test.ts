import { describe, it, expect, vi, beforeEach } from 'vitest'
import { NextRequest, NextResponse } from 'next/server'

// ---------- mock @supabase/ssr before importing updateSession ----------
const mockGetUser = vi.fn()
const mockGetAll = vi.fn()
const mockSetAll = vi.fn()

vi.mock('@supabase/ssr', () => ({
  createServerClient: (_url: string, _key: string, opts: {
    cookies: {
      getAll: () => { name: string; value: string }[]
      setAll: (c: { name: string; value: string; options: object }[]) => void
    }
  }) => {
    // Capture the setAll callback so we can verify it is called.
    mockGetAll.mockImplementation(opts.cookies.getAll)
    mockSetAll.mockImplementation(opts.cookies.setAll)
    return { auth: { getUser: mockGetUser } }
  },
}))

// Import AFTER the mock is set up.
const { updateSession } = await import('@/lib/supabase/middleware')

function makeRequest(path: string, cookieHeader = ''): NextRequest {
  const req = new NextRequest(`http://localhost${path}`)
  if (cookieHeader) req.headers.set('cookie', cookieHeader)
  return req
}

describe('updateSession', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    process.env.NEXT_PUBLIC_SUPABASE_URL = 'http://sb.test'
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = 'anon-test'
  })

  it('returns a NextResponse', async () => {
    mockGetUser.mockResolvedValue({ data: { user: null }, error: null })
    const req = makeRequest('/en/articles')
    const res = await updateSession(req)
    expect(res).toBeInstanceOf(NextResponse)
  })

  it('exposes the authenticated user via getUser()', async () => {
    mockGetUser.mockResolvedValue({ data: { user: { id: 'uid-1', email: 'a@b.com' } }, error: null })
    const req = makeRequest('/en/creator')
    const { user } = await updateSession(req)
    expect(user?.id).toBe('uid-1')
  })

  it('returns null user when not authenticated', async () => {
    mockGetUser.mockResolvedValue({ data: { user: null }, error: null })
    const req = makeRequest('/en/sign-in')
    const { user } = await updateSession(req)
    expect(user).toBeNull()
  })
})
