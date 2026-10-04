import { describe, it, expect, vi, beforeEach } from 'vitest'

type RpcResult = { data: unknown; error: { message: string } | null }
type GateResult = { ok: true; user: { id: string } } | { ok: false; errors: Record<string, string[]> }

// Mirrors apps/web/tests/admin.creators-actions.test.ts's proven pattern for testing an
// action built on requireOpsAction: mock @/lib/admin/guard directly rather than
// re-deriving getAuthorizationContext's internals (verified against the real
// requireOpsAction in apps/web/lib/admin/guard.ts, which returns exactly this shape).
const { rpcMock, gateMock, revalidateMock } = vi.hoisted(() => ({
  rpcMock: vi.fn(async (): Promise<RpcResult> => ({ data: null, error: null })),
  gateMock: vi.fn(async (): Promise<GateResult> => ({ ok: true, user: { id: 'ops-1' } })),
  revalidateMock: vi.fn(),
}))
vi.mock('next/cache', () => ({ revalidatePath: revalidateMock }))
vi.mock('@/lib/supabase/server', () => ({ createSupabaseServerClient: async () => ({ rpc: rpcMock }) }))
vi.mock('@/lib/admin/guard', () => ({ requireOpsAction: gateMock }))

import { reviewSubmissionOpsAction, setMissionAutoApprovePolicyAction } from '@/lib/admin/mission-review-actions'

beforeEach(() => {
  rpcMock.mockReset().mockResolvedValue({ data: null, error: null })
  gateMock.mockReset().mockResolvedValue({ ok: true, user: { id: 'ops-1' } })
  revalidateMock.mockReset()
})

describe('reviewSubmissionOpsAction', () => {
  it('approves without requiring a reason category', async () => {
    const res = await reviewSubmissionOpsAction('en', 'sub-1', 'approve', null, null)
    expect(res).toEqual({ ok: true, id: 'sub-1' })
    expect(rpcMock).toHaveBeenCalledWith('admin_review_submission', {
      p_submission_id: 'sub-1', p_action: 'approve', p_reason_category: null, p_reason_text: null,
    })
    expect(revalidateMock).toHaveBeenCalledWith('/en/admin/missions/review')
  })

  it('revalidates only the queue path when no missionId is supplied', async () => {
    const res = await reviewSubmissionOpsAction('en', 'sub-1', 'approve', null, null)
    expect(res).toEqual({ ok: true, id: 'sub-1' })
    expect(revalidateMock).toHaveBeenCalledTimes(1)
    expect(revalidateMock).toHaveBeenCalledWith('/en/admin/missions/review')
  })

  it('revalidates only the queue path when missionId is explicitly null', async () => {
    const res = await reviewSubmissionOpsAction('en', 'sub-1', 'approve', null, null, null)
    expect(res).toEqual({ ok: true, id: 'sub-1' })
    expect(revalidateMock).toHaveBeenCalledTimes(1)
    expect(revalidateMock).toHaveBeenCalledWith('/en/admin/missions/review')
  })

  it('revalidates both the queue and mission detail paths when a missionId is supplied', async () => {
    const res = await reviewSubmissionOpsAction('en', 'sub-1', 'approve', null, null, 'mission-1')
    expect(res).toEqual({ ok: true, id: 'sub-1' })
    expect(revalidateMock).toHaveBeenCalledTimes(2)
    expect(revalidateMock).toHaveBeenCalledWith('/en/admin/missions/review')
    expect(revalidateMock).toHaveBeenCalledWith('/en/admin/missions/mission-1')
  })

  it('rejects a reject-action call missing a reason category before hitting the RPC', async () => {
    const res = await reviewSubmissionOpsAction('en', 'sub-1', 'reject', null, 'bad vibes')
    expect(res.ok).toBe(false)
    expect(rpcMock).not.toHaveBeenCalled()
  })

  it('rejects a request_revision call with a blank reason category before hitting the RPC', async () => {
    const res = await reviewSubmissionOpsAction('en', 'sub-1', 'request_revision', '   ', null)
    expect(res.ok).toBe(false)
    expect(rpcMock).not.toHaveBeenCalled()
  })

  it('passes a reject action through once a reason category is supplied', async () => {
    const res = await reviewSubmissionOpsAction('en', 'sub-1', 'reject', 'quality', 'blurry photo')
    expect(res).toEqual({ ok: true, id: 'sub-1' })
    expect(rpcMock).toHaveBeenCalledWith('admin_review_submission', {
      p_submission_id: 'sub-1', p_action: 'reject', p_reason_category: 'quality', p_reason_text: 'blurry photo',
    })
  })

  it('returns the gate failure for a non-ops caller without calling the RPC', async () => {
    gateMock.mockResolvedValueOnce({ ok: false, errors: { form: ['Active ops access is required'] } })
    const res = await reviewSubmissionOpsAction('en', 'sub-1', 'approve', null, null)
    expect(res.ok).toBe(false)
    expect(rpcMock).not.toHaveBeenCalled()
    expect(revalidateMock).not.toHaveBeenCalled()
  })

  it('maps a stale_status RPC error to a friendly message', async () => {
    rpcMock.mockResolvedValueOnce({ data: null, error: { message: 'stale_status' } })
    const res = await reviewSubmissionOpsAction('en', 'sub-1', 'approve', null, null)
    expect(res.ok).toBe(false)
    if (!res.ok) expect(res.errors.form?.[0]).toMatch(/already been reviewed/i)
    expect(revalidateMock).not.toHaveBeenCalled()
  })

  it('maps a forbidden RPC error to friendly copy', async () => {
    rpcMock.mockResolvedValueOnce({ data: null, error: { message: 'forbidden' } })
    const res = await reviewSubmissionOpsAction('en', 'sub-1', 'approve', null, null)
    expect(res.ok).toBe(false)
    if (!res.ok) expect(res.errors.form?.[0]).toMatch(/ops access/i)
  })

  it('maps insufficient_budget to friendly copy', async () => {
    rpcMock.mockResolvedValueOnce({ data: null, error: { message: 'insufficient_budget' } })
    const result = await reviewSubmissionOpsAction('en', 's1', 'approve', null, null, null)
    expect(result).toEqual({ ok: false, errors: { form: ['The merchant budget cannot cover this fee — fund it before approving.'] } })
    expect(revalidateMock).not.toHaveBeenCalled()
  })

  it('maps currency_mismatch to friendly copy', async () => {
    rpcMock.mockResolvedValueOnce({ data: null, error: { message: 'currency_mismatch' } })
    const result = await reviewSubmissionOpsAction('en', 's1', 'approve', null, null, null)
    expect(result).toEqual({ ok: false, errors: { form: ['Budget currency does not match this mission.'] } })
  })
})

describe('setMissionAutoApprovePolicyAction', () => {
  it('calls admin_set_mission_auto_approve_policy and revalidates the mission detail page', async () => {
    const result = await setMissionAutoApprovePolicyAction('en', 'mission-1', 'verified_signal_only')
    expect(result.ok).toBe(true)
    expect(rpcMock).toHaveBeenCalledWith('admin_set_mission_auto_approve_policy', {
      p_mission_id: 'mission-1', p_policy: 'verified_signal_only',
    })
  })

  it('maps a bad_policy error to friendly copy', async () => {
    rpcMock.mockResolvedValueOnce({ data: null, error: { message: 'bad_policy' } })
    const result = await setMissionAutoApprovePolicyAction('en', 'mission-1', 'not_a_real_policy')
    expect(result.ok).toBe(false)
  })
})
