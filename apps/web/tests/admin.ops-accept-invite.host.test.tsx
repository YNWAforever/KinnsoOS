// @vitest-environment jsdom
import { cleanup, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
afterEach(cleanup)

type RpcResult = { data: unknown; error: { message: string } | null }
const { getUserMock, rpcMock, redirectMock } = vi.hoisted(() => ({
  getUserMock: vi.fn(async () => ({ data: { user: { id: 'u1', email: 'alice@example.com' } } })),
  rpcMock:     vi.fn(async (): Promise<RpcResult> => ({ data: null, error: null })),
  redirectMock: vi.fn((p: string) => { throw new Error(`NEXT_REDIRECT:${p}`) }),
}))
vi.mock('next/navigation', () => ({
  redirect:    redirectMock,
  notFound:    () => { throw new Error('NEXT_NOT_FOUND') },
  useRouter:   () => ({ push: vi.fn() }),
  usePathname: () => '/',
}))
vi.mock('@/lib/supabase/server', () => ({
  createSupabaseServerClient: async () => ({ auth: { getUser: getUserMock }, rpc: rpcMock }),
}))

import AcceptInvitePage from '@/app/[locale]/ops/accept-invite/page'

const params = (locale = 'en') => Promise.resolve({ locale })
const searchParams = (token = 'tok123') => Promise.resolve({ token })

beforeEach(() => {
  getUserMock.mockReset().mockResolvedValue({ data: { user: { id: 'u1', email: 'alice@example.com' } } })
  rpcMock.mockReset().mockResolvedValue({ data: null, error: null })
  redirectMock.mockReset().mockImplementation((p: string) => { throw new Error(`NEXT_REDIRECT:${p}`) })
})

describe('accept-invite page', () => {
  it('shows success message when token is valid', async () => {
    const ui = await AcceptInvitePage({ params: params(), searchParams: searchParams() })
    render(ui)
    expect(screen.getByText(/ops access/i)).toBeTruthy()
  })
  it('calls admin_accept_ops_invite with the token', async () => {
    await AcceptInvitePage({ params: params(), searchParams: searchParams('mytoken') })
    expect(rpcMock).toHaveBeenCalledWith('admin_accept_ops_invite', { p_token: 'mytoken' })
  })
  it('redirects to sign-in when user is not signed in', async () => {
    getUserMock.mockResolvedValueOnce({ data: { user: null } } as never)
    await expect(AcceptInvitePage({ params: params(), searchParams: searchParams() }))
      .rejects.toThrow('NEXT_REDIRECT:/en/sign-in?next=%2Fen%2Fops%2Faccept-invite%3Ftoken%3Dtok123')
  })
  it('shows expired message on invite_expired error', async () => {
    rpcMock.mockResolvedValueOnce({ data: null, error: { message: 'invite_expired' } })
    const ui = await AcceptInvitePage({ params: params(), searchParams: searchParams() })
    render(ui)
    expect(screen.getByText(/expired/i)).toBeTruthy()
  })
  it('shows email-mismatch message on email_mismatch error', async () => {
    rpcMock.mockResolvedValueOnce({ data: null, error: { message: 'email_mismatch' } })
    const ui = await AcceptInvitePage({ params: params(), searchParams: searchParams() })
    render(ui)
    expect(screen.getByText(/different email/i)).toBeTruthy()
  })
  it('shows not-found message when token is missing', async () => {
    const ui = await AcceptInvitePage({ params: params(), searchParams: Promise.resolve({}) })
    render(ui)
    expect(screen.getByText(/not found/i)).toBeTruthy()
  })
})
