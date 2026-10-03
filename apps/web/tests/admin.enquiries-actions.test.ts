// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from 'vitest'

const { gateMock, rpcMock, revalidateMock } = vi.hoisted(() => ({
  gateMock: vi.fn(), rpcMock: vi.fn(), revalidateMock: vi.fn(),
}))
vi.mock('@/lib/admin/guard', () => ({ requireOpsAction: gateMock }))
vi.mock('@/lib/supabase/server', () => ({ createSupabaseServerClient: async () => ({ rpc: rpcMock }) }))
vi.mock('next/cache', () => ({ revalidatePath: revalidateMock }))

import { setEnquiryStatusAction } from '@/lib/admin/enquiries-actions'

const id = '11111111-1111-4111-8111-111111111111'

beforeEach(() => {
  vi.clearAllMocks()
  gateMock.mockResolvedValue({ ok: true, user: { id: 'ops1' } })
  rpcMock.mockResolvedValue({ data: null, error: null })
})

describe('setEnquiryStatusAction', () => {
  it('blocks non-ops callers before the status RPC', async () => {
    gateMock.mockResolvedValue({ ok: false, errors: { form: ['Active ops access is required'] } })
    await expect(setEnquiryStatusAction('en', id, 'in_progress', '')).resolves.toMatchObject({ ok: false })
    expect(rpcMock).not.toHaveBeenCalled()
  })

  it('rejects malformed ids, statuses, and terminal actions without a reason', async () => {
    await setEnquiryStatusAction('en', 'not-a-uuid', 'in_progress', '')
    await setEnquiryStatusAction('en', id, 'invalid' as never, '')
    await setEnquiryStatusAction('en', id, 'resolved', '   ')
    expect(rpcMock).not.toHaveBeenCalled()
  })

  it('allows new to in-progress without inventing a client-side current state or reason', async () => {
    await expect(setEnquiryStatusAction('en', id, 'in_progress', '')).resolves.toMatchObject({ ok: true })
    expect(rpcMock).toHaveBeenCalledWith('admin_set_enquiry_status', {
      p_id: id, p_status: 'in_progress', p_reason: undefined,
    })
  })

  it('trims a terminal reason, delegates transition validation to the locked RPC, and revalidates the localized queue', async () => {
    await expect(setEnquiryStatusAction('zh-hk', id, 'spam', ' duplicate contact ')).resolves.toMatchObject({ ok: true })
    expect(rpcMock).toHaveBeenCalledWith('admin_set_enquiry_status', {
      p_id: id, p_status: 'spam', p_reason: 'duplicate contact',
    })
    expect(revalidateMock).toHaveBeenCalledWith('/zh-hk/admin/enquiries')
  })

  it('retains a safe form error and logs only an error code on RPC failure', async () => {
    rpcMock.mockResolvedValue({ data: null, error: { code: '22023', message: 'visitor@example.test: private detail' } })
    const log = vi.spyOn(console, 'error').mockImplementation(() => {})
    await expect(setEnquiryStatusAction('en', id, 'spam', 'spam')).resolves.toMatchObject({ ok: false })
    expect(log).toHaveBeenCalledWith('[admin:enquiries] status change failed', { code: '22023' })
    expect(revalidateMock).not.toHaveBeenCalled()
    log.mockRestore()
  })
})
