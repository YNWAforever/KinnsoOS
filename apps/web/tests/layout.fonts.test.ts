import { existsSync, readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, it, expect, vi } from 'vitest'

// next/font/local is not callable under vitest (no SWC font transform) — stub
// it, same pattern as tests/layout.siteChrome.test.tsx. The stub echoes the
// `variable` option it was called with, so the assertions below bind
// fonts.ts's option strings to the var(--font-*) references that globals.css
// uses.
vi.mock('next/font/local', () => ({
  default: (o: { variable: string }) => ({ variable: o.variable }),
}))

import { fontVariables } from '@/app/fonts'

const fontSource = readFileSync(resolve(process.cwd(), 'app/fonts.ts'), 'utf8')

describe('R1C typography wiring', () => {
  it('exposes JetBrains Mono, Fraunces, and Inter variables', () => {
    for (const v of ['--font-jetbrains-mono', '--font-fraunces', '--font-inter']) {
      expect(fontVariables).toContain(v)
    }
  })

  it('no longer exposes the retired Bricolage / DM Sans variables', () => {
    expect(fontVariables).not.toContain('--font-bricolage')
    expect(fontVariables).not.toContain('--font-dm-sans')
  })

  it('self-hosts every face instead of fetching from Google Fonts at build time', () => {
    expect(fontSource).not.toMatch(/from 'next\/font\/google'/)
    const sources = [...fontSource.matchAll(/src: '(\.\/fonts\/[^']+\.woff2)'/g)].map((m) => m[1])
    expect(sources).toHaveLength(3)
    for (const src of sources) expect(existsSync(resolve(process.cwd(), 'app', src)), src).toBe(true)
  })
})
