// @vitest-environment jsdom
import { render, screen, cleanup } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'

const { authMock, resolveViewerRoleMock, getMyApplicationMock } = vi.hoisted(() => ({
  authMock: vi.fn(),
  resolveViewerRoleMock: vi.fn(),
  getMyApplicationMock: vi.fn(),
}))

vi.mock('next/navigation', () => ({ notFound: () => { throw new Error('notFound') } }))
vi.mock('@/lib/supabase/server', () => ({
  createSupabaseServerClient: async () => ({ auth: { getUser: authMock } }),
}))
vi.mock('@/lib/auth/viewer-role', () => ({ resolveViewerRole: resolveViewerRoleMock }))
vi.mock('@/lib/merchants/application-queries', () => ({ getMyMerchantApplication: getMyApplicationMock }))

import MerchantApplyPage from '@/app/[locale]/merchants/apply/page'

afterEach(cleanup)

describe('MerchantApplyPage', () => {
  it('notFound for an invalid locale', async () => {
    await expect(MerchantApplyPage({ params: Promise.resolve({ locale: 'xx' }) })).rejects.toThrow('notFound')
  })

  it('shows a sign-in prompt for anonymous visitors', async () => {
    authMock.mockResolvedValue({ data: { user: null } })
    const el = await MerchantApplyPage({ params: Promise.resolve({ locale: 'en' }) })
    render(el)
    expect(screen.getByRole('link', { name: /sign in/i })).toBeTruthy()
  })

  it('shows an already-merchant panel for a merchant viewer', async () => {
    authMock.mockResolvedValue({ data: { user: { id: 'u1' } } })
    resolveViewerRoleMock.mockResolvedValue('merchant')
    const el = await MerchantApplyPage({ params: Promise.resolve({ locale: 'en' }) })
    render(el)
    expect(screen.getByText(/already a merchant/i)).toBeTruthy()
  })

  it('shows the application form when the viewer has never applied', async () => {
    authMock.mockResolvedValue({ data: { user: { id: 'u1' } } })
    resolveViewerRoleMock.mockResolvedValue('creator')
    getMyApplicationMock.mockResolvedValue(null)
    const el = await MerchantApplyPage({ params: Promise.resolve({ locale: 'en' }) })
    render(el)
    expect(screen.getByRole('button', { name: /submit application/i })).toBeTruthy()
  })

  it('shows a pending panel when an application is under review', async () => {
    authMock.mockResolvedValue({ data: { user: { id: 'u1' } } })
    resolveViewerRoleMock.mockResolvedValue('creator')
    getMyApplicationMock.mockResolvedValue({ id: 'app1', status: 'pending', companyName: 'Acme', decisionReason: null, createdAt: '2026-07-03T00:00:00Z' })
    const el = await MerchantApplyPage({ params: Promise.resolve({ locale: 'en' }) })
    render(el)
    expect(screen.getByText(/under review/i)).toBeTruthy()
  })

  it('shows a rejected panel with the reviewer note and a re-apply CTA', async () => {
    authMock.mockResolvedValue({ data: { user: { id: 'u1' } } })
    resolveViewerRoleMock.mockResolvedValue('creator')
    getMyApplicationMock.mockResolvedValue({
      id: 'app1', status: 'rejected', companyName: 'Acme', decisionReason: 'Not a fit right now', createdAt: '2026-07-03T00:00:00Z',
    })
    const el = await MerchantApplyPage({ params: Promise.resolve({ locale: 'en' }) })
    render(el)
    expect(screen.getByText(/not approved/i)).toBeTruthy()
    expect(screen.getByText(/Not a fit right now/)).toBeTruthy()
    expect(screen.getByRole('button', { name: /apply again/i })).toBeTruthy()
  })
})
