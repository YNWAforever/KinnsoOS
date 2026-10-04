import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

const servicePath = resolve(import.meta.dirname, '../lib/supabase/service.ts')
const designPath = resolve(import.meta.dirname, '../../../docs/contracts/session-waitlist.md')

describe('session waitlist privileged boundary contract', () => {
  it('marks the service client module as server-only', () => {
    const source = readFileSync(servicePath, 'utf8')
    expect(source).toMatch(/^import 'server-only'/m)
  })

  it('binds the narrow waitlist exception and every precondition in the program design', () => {
    const design = readFileSync(designPath, 'utf8')
    expect(design).toContain('session waitlist server action')
    expect(design).toContain('honeypot')
    expect(design).toContain('email and locale validation')
    expect(design).toContain('Vercel-provided `getClientIp()` anti-abuse value')
    expect(design).toContain('rate-limit success')
    expect(design).toContain('SSR `getUser()`')
    expect(design).toContain('normalized email')
    expect(design).toContain('derived `user_id`')
    expect(design).toContain('duplicate email is success')
    expect(design).toContain('never exposed to the browser')
  })
})
