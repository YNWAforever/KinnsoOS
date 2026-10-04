// @vitest-environment jsdom
import { render, screen, cleanup } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'

vi.mock('next/navigation', () => ({
  notFound: () => { throw new Error('notFound') },
  redirect: (url: string) => { throw new Error(`redirect:${url}`) },
  useRouter: () => ({ push: vi.fn(), refresh: vi.fn() }),
  usePathname: () => '/en/admin/merchants/applications',
}))
vi.mock('@/lib/supabase/server', () => ({ createSupabaseServerClient: async () => ({}) }))
vi.mock('@/lib/admin/guard', () => ({ requireOpsPage: vi.fn(async () => ({ user: { id: 'ops1' } })) }))
vi.mock('@/lib/admin/merchant-applications-queries', () => ({
  listPendingMerchantApplications: vi.fn(async () => ([{
    id: 'app1', userId: 'u1', companyName: 'Acme Travel', contactName: 'Jane', contactEmail: 'jane@acme.example',
    websiteUrl: 'https://acme.example', pitch: 'Boutique tours', status: 'pending',
    decidedAt: null, decisionReason: null, createdAt: '2026-07-03T00:00:00.000Z',
  }])),
  listDecidedMerchantApplications: vi.fn(async () => ([])),
}))

import AdminMerchantApplicationsPage from '@/app/[locale]/admin/merchants/applications/page'

afterEach(cleanup)

describe('AdminMerchantApplicationsPage', () => {
  it('notFound for an invalid locale', async () => {
    await expect(AdminMerchantApplicationsPage({ params: Promise.resolve({ locale: 'xx' }) })).rejects.toThrow('notFound')
  })

  it('renders the pending application with approve/reject actions', async () => {
    const el = await AdminMerchantApplicationsPage({ params: Promise.resolve({ locale: 'en' }) })
    render(el)
    expect(screen.getByText('Acme Travel')).toBeTruthy()
    expect(screen.getByRole('button', { name: /approve/i })).toBeTruthy()
    expect(screen.getByRole('button', { name: /reject/i })).toBeTruthy()
  })
})
