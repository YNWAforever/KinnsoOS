import { describe, it, expect, vi, beforeEach } from 'vitest'
import type { ActionFailure } from '@/lib/admin/result'

// Mirrors offers.actions.test.ts's mock shape for claimOfferAction -- submitReceiptAction
// follows the exact same gate + RPC + FRIENDLY-table convention.
const { gateMock, rpcMock, revalidatePathMock } = vi.hoisted(() => ({
  gateMock: vi.fn<() => Promise<{ ok: true; user: { id: string } } | ActionFailure>>(async () => ({
    ok: true, user: { id: 'creator-1' },
  })),
  rpcMock: vi.fn(),
  revalidatePathMock: vi.fn(),
}))

vi.mock('@/lib/admin/guard', () => ({ requireCreatorAction: gateMock }))
vi.mock('@/lib/supabase/server', () => ({ createSupabaseServerClient: async () => ({ rpc: rpcMock }) }))
vi.mock('next/cache', () => ({ revalidatePath: revalidatePathMock }))

import { submitReceiptAction } from '@/lib/missions/actions'

beforeEach(() => {
  gateMock.mockReset()
  gateMock.mockResolvedValue({ ok: true, user: { id: 'creator-1' } })
  rpcMock.mockReset()
  revalidatePathMock.mockClear()
})

describe('submitReceiptAction', () => {
  it.each([
    ['a whitespace-only proof URL', '   '],
    ['plain non-URL text', 'not a url'],
  ])('rejects %s client-side, before the gate or the RPC are ever reached', async (_label, proofUrl) => {
    const result = await submitReceiptAction({ missionId: 'm1', proofUrl })
    expect(result.ok).toBe(false)
    if (!result.ok) {
      expect(Object.values(result.errors).flat().length).toBeGreaterThan(0)
    }
    expect(gateMock).not.toHaveBeenCalled()
    expect(rpcMock).not.toHaveBeenCalled()
  })

  it('rejects a signed-out / non-creator caller before ever calling the RPC', async () => {
    gateMock.mockResolvedValueOnce({ ok: false, errors: { form: ['Sign in is required'] } })
    const result = await submitReceiptAction({ missionId: 'm1', proofUrl: 'https://x/receipt.jpg' })
    expect(result.ok).toBe(false)
    expect(rpcMock).not.toHaveBeenCalled()
  })

  it('calls submit_receipt with the mission id and a single-element, trimmed proof URL array', async () => {
    rpcMock.mockResolvedValue({ data: { submission_id: 'sub-1' }, error: null })
    const result = await submitReceiptAction({ missionId: 'm1', proofUrl: '  https://x/receipt.jpg  ' })
    expect(rpcMock).toHaveBeenCalledWith('submit_receipt', {
      p_mission_id: 'm1', p_proof_urls: ['https://x/receipt.jpg'],
    })
    expect(result).toEqual({ ok: true, submissionId: 'sub-1' })
    expect(revalidatePathMock).toHaveBeenCalled()
  })

  it.each([
    ['unauthorized', /sign in/i],
    ['proof_required', /photo/i],
    ['mission_not_found', /not available/i],
    ['wrong_mission_type', /does not accept receipt/i],
    ['not_active_participant', /join this mission/i],
    ['no_repeatable_milestone', /not set up/i],
    ['receipt_cap_reached', /limit/i],
  ])('maps the %s RPC error to a friendly, non-leaking message', async (code, pattern) => {
    rpcMock.mockResolvedValue({ data: null, error: { message: code } })
    const result = await submitReceiptAction({ missionId: 'm1', proofUrl: 'https://x/receipt.jpg' })
    expect(result.ok).toBe(false)
    if (!result.ok) {
      const message = Object.values(result.errors).flat()[0]
      expect(message).toMatch(pattern)
      expect(message).not.toBe(code)
    }
  })

  it('falls back to a generic message for an unrecognized RPC error, without leaking it', async () => {
    rpcMock.mockResolvedValue({ data: null, error: { message: 'some_new_db_error' } })
    const result = await submitReceiptAction({ missionId: 'm1', proofUrl: 'https://x/receipt.jpg' })
    expect(result.ok).toBe(false)
    if (!result.ok) {
      expect(Object.values(result.errors).flat()[0]).toBe('Receipt could not be submitted')
    }
  })
})
