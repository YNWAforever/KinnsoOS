import { describe, it, expect, vi, beforeEach } from 'vitest'
import type { SessionInput } from '@/lib/sessions/types'

const { requireCreatorActionMock, fromMock, revalidatePathMock } = vi.hoisted(() => ({
  requireCreatorActionMock: vi.fn(async (): Promise<{ ok: true; user: { id: string } } | { ok: false; errors: Record<string, string[]> }> => ({
    ok: true, user: { id: 'creator-1' },
  })),
  fromMock: vi.fn(),
  revalidatePathMock: vi.fn(),
}))
vi.mock('@/lib/admin/guard', () => ({ requireCreatorAction: requireCreatorActionMock }))
vi.mock('@/lib/supabase/server', () => ({ createSupabaseServerClient: async () => ({ from: fromMock }) }))
vi.mock('next/cache', () => ({ revalidatePath: revalidatePathMock }))

import { createSessionAction, setSessionStatusAction } from '@/lib/sessions/studio-actions'

const validInput: SessionInput = {
  title: 'Tokyo ramen AMA', description: 'Ask away.', type: 'ask_a_creator',
  startsAt: '2027-01-15T18:00:00.000Z', durationMinutes: '45',
  embedUrl: '', replayUrl: '', destinationTags: 'Tokyo',
}

function chain(finalValue: unknown) {
  const builder: Record<string, unknown> = {}
  for (const m of ['insert', 'update', 'select', 'eq', 'single', 'maybeSingle']) builder[m] = vi.fn(() => builder)
  builder.single = vi.fn(async () => finalValue)
  builder.maybeSingle = vi.fn(async () => finalValue)
  return builder
}

beforeEach(() => {
  requireCreatorActionMock.mockClear()
  requireCreatorActionMock.mockResolvedValue({ ok: true, user: { id: 'creator-1' } })
  fromMock.mockReset()
  revalidatePathMock.mockClear()
})

describe('createSessionAction', () => {
  it('fails the gate for a non-creator', async () => {
    requireCreatorActionMock.mockResolvedValueOnce({ ok: false, errors: { form: ['Creator access is required'] } })
    const result = await createSessionAction(validInput, { locale: 'en' })
    expect(result.ok).toBe(false)
  })

  it('inserts with host_creator_id = the gated creator id, and revalidates the Studio list', async () => {
    fromMock.mockReturnValue(chain({ data: { id: 'sess-1', slug: 'tokyo-ramen-ama-abc123' }, error: null }))
    const result = await createSessionAction(validInput, { locale: 'en' })
    expect(result).toEqual({ ok: true, id: 'sess-1', slug: 'tokyo-ramen-ama-abc123' })
    const insertedRow = (fromMock.mock.results[0].value.insert as ReturnType<typeof vi.fn>).mock.calls[0][0]
    expect(insertedRow.host_creator_id).toBe('creator-1')
    expect(insertedRow.title).toBe('Tokyo ramen AMA')
    expect(revalidatePathMock).toHaveBeenCalledWith('/en/studio/sessions')
  })

  it('returns validation errors without touching the database', async () => {
    const result = await createSessionAction({ ...validInput, title: '' }, { locale: 'en' })
    expect(result.ok).toBe(false)
    expect(fromMock).not.toHaveBeenCalled()
  })
})

describe('setSessionStatusAction', () => {
  it('refuses to go live without an embed_url set', async () => {
    fromMock.mockReturnValue(chain({ data: { embed_url: null }, error: null }))
    const result = await setSessionStatusAction('sess-1', 'live', { locale: 'en' })
    expect(result.ok).toBe(false)
  })

  it('allows going live once embed_url is set', async () => {
    const readChain = chain({ data: { embed_url: 'https://youtu.be/abc' }, error: null })
    const writeChain = chain({ data: { id: 'sess-1' }, error: null })
    let call = 0
    fromMock.mockImplementation(() => (call++ === 0 ? readChain : writeChain))
    const result = await setSessionStatusAction('sess-1', 'live', { locale: 'en' })
    expect(result.ok).toBe(true)
  })

  it('scopes the update to the gated creator (host_creator_id eq)', async () => {
    const readChain = chain({ data: { embed_url: 'https://youtu.be/abc' }, error: null })
    const writeChain = chain({ data: { id: 'sess-1' }, error: null })
    let call = 0
    fromMock.mockImplementation(() => (call++ === 0 ? readChain : writeChain))
    await setSessionStatusAction('sess-1', 'live', { locale: 'en' })
    expect(writeChain.eq).toHaveBeenCalledWith('host_creator_id', 'creator-1')
  })
})
