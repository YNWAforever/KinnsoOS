import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { OG } from '@/lib/seo/og/card'

// satori can't resolve CSS variables, so the OG cards hardcode literal hex that must
// stay in lockstep with the @theme brand tokens in app/globals.css. globals.css is the
// source of truth; this test fails if a rebrand updates one copy but not the other.
const css = readFileSync(resolve(process.cwd(), 'app/globals.css'), 'utf8')

function token(name: string): string | undefined {
  return css.match(new RegExp(`--color-${name}:\\s*(#[0-9A-Fa-f]{6})`, 'i'))?.[1]?.toUpperCase()
}

describe('OG palette parity with globals.css @theme', () => {
  it('every OG card color matches its brand token', () => {
    expect(OG.orange.toUpperCase()).toBe(token('orange'))
    expect(OG.cream.toUpperCase()).toBe(token('cream'))
    expect(OG.ink.toUpperCase()).toBe(token('ink'))
    expect(OG.muted.toUpperCase()).toBe(token('muted'))
  })

  it('finds all four tokens in globals.css (guards against a renamed/removed token)', () => {
    for (const name of ['orange', 'cream', 'ink', 'muted']) {
      expect(token(name), `--color-${name} missing from globals.css`).toBeDefined()
    }
  })
})
