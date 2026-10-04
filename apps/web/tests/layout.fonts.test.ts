import { describe, it, expect, vi } from 'vitest'

// next/font/google factories are not callable under vitest (no SWC font
// transform) — stub them, same pattern as tests/layout.siteChrome.test.tsx.
// Each stub echoes the `variable` option it was called with, so the assertions
// below bind layout.tsx's option strings to the var(--font-*) references that
// globals.css uses.
vi.mock('next/font/google', () => ({
  JetBrains_Mono: (o: { variable: string }) => ({ variable: o.variable }),
  Fraunces: (o: { variable: string }) => ({ variable: o.variable }),
  Inter: (o: { variable: string }) => ({ variable: o.variable }),
}))

import { fontVariables } from '@/app/layout'

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
})
