import { describe, expect, it, vi } from 'vitest'

const { createServerClientMock, cookiesMock } = vi.hoisted(() => ({
  createServerClientMock: vi.fn(() => ({ marker: 'client' })),
  cookiesMock: vi.fn(async () => ({ getAll: () => [], set: vi.fn() })),
}))

vi.mock('@supabase/ssr', () => ({ createServerClient: createServerClientMock }))
vi.mock('next/headers', () => ({ cookies: cookiesMock }))

import { createSupabaseServerClient } from '@/lib/supabase/server'

describe('createSupabaseServerClient', () => {
  it('preserves cookie handling while forwarding per-client global headers', async () => {
    await expect(createSupabaseServerClient({
      global: { headers: { 'x-kinnso-enquiry-attestation': 'signed' } },
    })).resolves.toEqual({ marker: 'client' })

    expect(createServerClientMock).toHaveBeenCalledWith(
      expect.any(String),
      expect.any(String),
      expect.objectContaining({
        global: { headers: { 'x-kinnso-enquiry-attestation': 'signed' } },
        cookies: expect.any(Object),
      }),
    )
  })
})
