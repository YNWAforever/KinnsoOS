// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const { roleMock, getUserMock, listMock } = vi.hoisted(() => ({
  roleMock: vi.fn(async () => 'ops'),
  getUserMock: vi.fn(async () => ({ data: { user: { id: 'ops1' } } })),
  listMock: vi.fn(async () => []),
}))
vi.mock('next/navigation', () => ({
  notFound: () => { throw new Error('NEXT_NOT_FOUND') },
  redirect: (p: string) => { throw new Error(`NEXT_REDIRECT:${p}`) },
}))
vi.mock('@/lib/auth/viewer-role', () => ({ resolveViewerRole: roleMock }))
vi.mock('@/lib/auth/authorization-context', () => ({
  getAuthorizationContext: async () => {
    const { data: { user } } = await getUserMock()
    return { user: user ? { id: user.id } : null, role: await roleMock(), merchantId: null }
  },
}))
vi.mock('@/lib/admin/testimonials-queries', () => ({ listAllTestimonials: listMock }))
vi.mock('@/lib/supabase/server', () => ({ createSupabaseServerClient: async () => ({ auth: { getUser: getUserMock } }) }))
vi.mock('@/components/kinnso/admin/AdminTestimonialsView', () => ({
  AdminTestimonialsView: () => <div data-testid="testimonials-view" />,
}))

import AdminTestimonialsPage from '@/app/[locale]/admin/testimonials/page'

beforeEach(() => {
  roleMock.mockResolvedValue('ops')
  getUserMock.mockResolvedValue({ data: { user: { id: 'ops1' } } })
})
afterEach(() => vi.clearAllMocks())

describe('/admin/testimonials host', () => {
  it('notFounds for a non-ops viewer', async () => {
    roleMock.mockResolvedValueOnce('creator')
    await expect(AdminTestimonialsPage({ params: Promise.resolve({ locale: 'en' }) })).rejects.toThrow('NEXT_NOT_FOUND')
  })
  it('redirects anon to sign-in', async () => {
    getUserMock.mockResolvedValueOnce({ data: { user: null } } as never)
    await expect(AdminTestimonialsPage({ params: Promise.resolve({ locale: 'en' }) })).rejects.toThrow('NEXT_REDIRECT:/en/sign-in')
  })
  it('renders the testimonials view for ops', async () => {
    const ui = await AdminTestimonialsPage({ params: Promise.resolve({ locale: 'en' }) })
    expect(ui).toBeTruthy()
    expect(listMock).toHaveBeenCalled()
  })
  it('404s unknown locales', async () => {
    await expect(AdminTestimonialsPage({ params: Promise.resolve({ locale: 'xx' }) })).rejects.toThrow('NEXT_NOT_FOUND')
  })
})
