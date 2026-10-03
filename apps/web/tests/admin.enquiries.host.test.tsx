// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const { opsPageGateMock, getUserMock, listMock, viewMock } = vi.hoisted(() => ({
  opsPageGateMock: vi.fn(async () => ({ user: { id: 'ops1' } })),
  getUserMock: vi.fn(async () => ({ data: { user: { id: 'ops1' } } })),
  listMock: vi.fn<(...args: unknown[]) => Promise<unknown[]>>(async () => []), viewMock: vi.fn(() => <div data-testid="enquiries-view" />),
}))
vi.mock('next/navigation', () => ({
  notFound: () => { throw new Error('NEXT_NOT_FOUND') },
  redirect: (path: string) => { throw new Error(`NEXT_REDIRECT:${path}`) },
}))
vi.mock('@/lib/admin/guard', () => ({ requireOpsPage: opsPageGateMock }))
vi.mock('@/lib/admin/enquiries-queries', () => ({ listAdminEnquiries: listMock }))
vi.mock('@/lib/supabase/server', () => ({ createSupabaseServerClient: async () => ({ auth: { getUser: getUserMock } }) }))
vi.mock('@/components/kinnso/admin/AdminEnquiriesView', () => ({ AdminEnquiriesView: viewMock }))

import AdminEnquiriesPage from '@/app/[locale]/admin/enquiries/page'

beforeEach(() => {
  opsPageGateMock.mockResolvedValue({ user: { id: 'ops1' } })
  getUserMock.mockResolvedValue({ data: { user: { id: 'ops1' } } })
  listMock.mockResolvedValue([])
})
afterEach(() => vi.clearAllMocks())

describe('/admin/enquiries host', () => {
  it('redirects anonymous visitors and 404s authenticated non-ops before the PII queue query', async () => {
    opsPageGateMock.mockRejectedValueOnce(new Error('NEXT_REDIRECT:/en/sign-in'))
    await expect(AdminEnquiriesPage({ params: Promise.resolve({ locale: 'en' }), searchParams: Promise.resolve({}) })).rejects.toThrow('NEXT_REDIRECT:/en/sign-in')
    opsPageGateMock.mockRejectedValueOnce(new Error('NEXT_NOT_FOUND'))
    await expect(AdminEnquiriesPage({ params: Promise.resolve({ locale: 'en' }), searchParams: Promise.resolve({}) })).rejects.toThrow('NEXT_NOT_FOUND')
    expect(listMock).not.toHaveBeenCalled()
  })

  it('loads the guarded view with the active/all default queue', async () => {
    const ui = await AdminEnquiriesPage({ params: Promise.resolve({ locale: 'en' }), searchParams: Promise.resolve({}) })
    expect(listMock).toHaveBeenCalledWith(expect.anything(), { status: 'active', type: 'all' }, null)
    expect((ui as { props: { enquiries: unknown[] } }).props.enquiries).toEqual([])
  })

  it('accepts only approved search-param enums and coerces arbitrary values to the safe defaults', async () => {
    await AdminEnquiriesPage({ params: Promise.resolve({ locale: 'en' }), searchParams: Promise.resolve({ status: 'spam', type: 'merchant_contact' }) })
    expect(listMock).toHaveBeenLastCalledWith(expect.anything(), { status: 'spam', type: 'merchant_contact' }, null)
    await AdminEnquiriesPage({ params: Promise.resolve({ locale: 'en' }), searchParams: Promise.resolve({ status: 'DROP TABLE', type: 'anything' }) })
    expect(listMock).toHaveBeenLastCalledWith(expect.anything(), { status: 'active', type: 'all' }, null)
  })
  it('forwards only a complete valid cursor and drops partial or invalid cursor pairs', async () => {
    const cursor = { createdAt: '2026-07-26T10:00:00.000Z', id: '11111111-1111-4111-8111-111111111111' }
    await AdminEnquiriesPage({ params: Promise.resolve({ locale: 'en' }), searchParams: Promise.resolve({ cursorCreatedAt: cursor.createdAt, cursorId: cursor.id }) })
    expect(listMock).toHaveBeenLastCalledWith(expect.anything(), { status: 'active', type: 'all' }, cursor)
    await AdminEnquiriesPage({ params: Promise.resolve({ locale: 'en' }), searchParams: Promise.resolve({ cursorCreatedAt: cursor.createdAt }) })
    expect(listMock).toHaveBeenLastCalledWith(expect.anything(), { status: 'active', type: 'all' }, null)
    await AdminEnquiriesPage({ params: Promise.resolve({ locale: 'en' }), searchParams: Promise.resolve({ cursorCreatedAt: 'not-a-timestamp', cursorId: 'bad' }) })
    expect(listMock).toHaveBeenLastCalledWith(expect.anything(), { status: 'active', type: 'all' }, null)
  })

  it('forwards PostgreSQL timestamptz cursor shapes exactly', async () => {
    const id = '11111111-1111-4111-8111-111111111111'
    const validTimestamps = [
      '2026-07-26T10:00:00Z',
      '2026-07-26T10:00:00.123Z',
      '2026-07-26T10:00:00.123456Z',
      '2026-07-26T10:00:00.123456+00:00',
      '2024-02-29T10:00:00+08:00',
    ]

    for (const createdAt of validTimestamps) {
      await AdminEnquiriesPage({ params: Promise.resolve({ locale: 'en' }), searchParams: Promise.resolve({ cursorCreatedAt: createdAt, cursorId: id }) })
      expect(listMock).toHaveBeenLastCalledWith(expect.anything(), { status: 'active', type: 'all' }, { createdAt, id })
    }
  })

  it('drops both cursor values when the timestamp calendar, ranges, offset, or format is invalid', async () => {
    const id = '11111111-1111-4111-8111-111111111111'
    const invalidTimestamps = [
      '2023-02-29T10:00:00Z',
      '2026-02-31T10:00:00Z',
      '2026-13-01T10:00:00Z',
      '2026-07-26T24:00:00Z',
      '2026-07-26T10:00:60Z',
      '2026-07-26T10:00:00+16:00',
      '2026-07-26T10:00:00+24:00',
      '2026-07-26T10:00:00+00:60',
      '2026-07-26 10:00:00Z',
    ]

    for (const cursorCreatedAt of invalidTimestamps) {
      await AdminEnquiriesPage({ params: Promise.resolve({ locale: 'en' }), searchParams: Promise.resolve({ cursorCreatedAt, cursorId: id }) })
      expect(listMock).toHaveBeenLastCalledWith(expect.anything(), { status: 'active', type: 'all' }, null)
    }
  })
  it('keeps the first 25 rows and uses row 25 as the forward cursor when row 26 proves another page exists', async () => {
    const rows = Array.from({ length: 26 }, (_, index) => ({
      id: `00000000-0000-4000-8000-${String(index + 1).padStart(12, '0')}`,
      createdAt: `2026-07-26T10:${String(59 - index).padStart(2, '0')}:00.000Z`,
    }))
    listMock.mockResolvedValueOnce(rows)
    const ui = await AdminEnquiriesPage({ params: Promise.resolve({ locale: 'en' }), searchParams: Promise.resolve({ status: 'spam', type: 'merchant_contact' }) })
    const props = (ui as { props: { enquiries: typeof rows; nextCursor: { createdAt: string; id: string } | null } }).props
    expect(props.enquiries).toHaveLength(25)
    expect(props.nextCursor).toEqual({ createdAt: rows[24].createdAt, id: rows[24].id })
    expect(props.enquiries.map((row) => row.id)).not.toContain(rows[25].id)
  })
})
