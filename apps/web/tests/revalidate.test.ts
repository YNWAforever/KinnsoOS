import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }))
import { revalidatePath } from 'next/cache'
import { POST } from '@/app/api/revalidate/route'

const makeReq = (body: unknown, secret?: string) =>
  new Request('http://x/api/revalidate', {
    method: 'POST',
    headers: { 'content-type': 'application/json', ...(secret ? { 'x-revalidate-secret': secret } : {}) },
    body: JSON.stringify(body),
  })

describe('POST /api/revalidate', () => {
  beforeEach(() => { vi.clearAllMocks(); process.env.REVALIDATE_SECRET = 's3cret' })

  it('401s without the secret', async () => {
    const res = await POST(makeReq({ path: '/en/articles/dining/x' }))
    expect(res.status).toBe(401)
    expect(revalidatePath).not.toHaveBeenCalled()
  })
  it('revalidates the path with the correct secret', async () => {
    const res = await POST(makeReq({ path: '/en/articles/dining/x' }, 's3cret'))
    expect(res.status).toBe(200)
    expect(revalidatePath).toHaveBeenCalledWith('/en/articles/dining/x')
  })
  it('400s on a missing path', async () => {
    const res = await POST(makeReq({}, 's3cret'))
    expect(res.status).toBe(400)
  })
})
