import { describe, it, expect } from 'vitest'
import { formError, type ActionResult } from '@/lib/admin/result'

describe('admin result', () => {
  it('formError wraps a message under errors.form and is not ok', () => {
    const r = formError('nope')
    expect(r.ok).toBe(false)
    expect(r.errors.form).toEqual(['nope'])
  })
  it('ActionResult success carries the payload', () => {
    const r: ActionResult<{ id: string }> = { ok: true, id: 'x' }
    expect(r.ok && r.id).toBe('x')
  })
})
