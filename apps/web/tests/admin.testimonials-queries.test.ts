import { describe, it, expect } from 'vitest'
import type { SupabaseClient } from '@supabase/supabase-js'
import type { Database } from '@kinnso/db'
import { listAllTestimonials } from '@/lib/admin/testimonials-queries'

function clientWith(result: { data: unknown; error: unknown }) {
  return {
    from: () => ({ select: () => ({ order: () => ({ order: async () => result }) }) }),
  } as unknown as SupabaseClient<Database>
}

describe('listAllTestimonials', () => {
  it('returns the rows (drafts included — this is the ops read)', async () => {
    const rows = [{ id: 't1', status: 'draft' }]
    expect(await listAllTestimonials(clientWith({ data: rows, error: null }))).toEqual(rows)
  })
  it('propagates errors — no silent empty list', async () => {
    await expect(listAllTestimonials(clientWith({ data: null, error: new Error('boom') }))).rejects.toThrow('boom')
  })
})
