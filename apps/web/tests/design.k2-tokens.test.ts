import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

// R1C token contract (user decision 2026-07-02): the ORIGINAL kinnso-* palette is
// canonical again. kinnso2-* color tokens are gone; the k2-* editorial utilities
// stay, recolored to kinnso-*; Fraunces/Inter own --font-display/--font-sans; the
// legacy k-* ticket utilities stay DEFINED for studio/admin only.
const css = readFileSync(join(__dirname, '../app/globals.css'), 'utf8')
const layout = readFileSync(join(__dirname, '../app/layout.tsx'), 'utf8')

describe('R1C canonical design tokens', () => {
  it('keeps the original kinnso-* palette as the only color system', () => {
    expect(css).toContain('--color-orange: #B94000')
    expect(css).toContain('--color-orange-dark: #A13E0B')
    expect(css).toContain('--color-kinnso-orange: #B94000')
    expect(css).toContain('--color-kinnso-orangeDark: #A13E0B')
    expect(css).toContain('--k-orange:      20.7568 100% 36.2745%')
    expect(css).toContain('--k-orange-dark: 20.4 87.2093% 33.7255%')
    expect(css).toContain('--color-kinnso-cream: #F8F1E6')
    expect(css).toContain('--color-kinnso-cream2: #EFE3D2')
    expect(css).toContain('--color-kinnso-ink: #211B16')
    expect(css).toContain('--color-kinnso-edge: #DED5C7')
    expect(css).toContain('--color-kinnso-amber: #F4BD50')
  })

  it('has no kinnso2 color tokens or k2 font aliases left', () => {
    expect(css).not.toMatch(/--color-kinnso2-/)
    expect(css).not.toMatch(/--font-k2-/)
  })

  it('wires Fraunces and Inter to the canonical font tokens (CJK-safe stacks)', () => {
    expect(css).toMatch(/--font-display:\s*var\(--font-fraunces\)/)
    expect(css).toMatch(/--font-sans:\s*var\(--font-inter\)/)
    expect(css).toMatch(/--font-mono:\s*var\(--font-jetbrains-mono\)/)
    expect(layout).not.toContain('Bricolage_Grotesque')
    expect(layout).not.toContain('DM_Sans')
    expect(layout).toContain('Fraunces')
    expect(layout).toContain('Inter')
  })

  it('recolors the k2-* editorial utilities to the original palette', () => {
    for (const cls of ['.k2-container', '.k2-display', '.k2-eyebrow', '.k2-card', '.k2-hairline', '.k2-btn-primary', '.k2-btn-ghost']) {
      expect(css).toContain(cls)
    }
    expect(css).toMatch(/\.k2-btn-primary\s*\{[^}]*bg-kinnso-orange/)
    expect(css).toMatch(/\.k2-btn-primary\s*\{[^}]*text-white/)
    expect(css).toMatch(/\.k2-btn-primary\s*\{[^}]*hover:bg-kinnso-orangeDark/)
    expect(css).toMatch(/\.k2-eyebrow\s*\{[^}]*text-kinnso-orangeDark/)
    expect(css).toMatch(/\.k2-card\s*\{[^}]*border-kinnso-edge/)
  })

  it('keeps the original global focus rule on kinnso-orange', () => {
    expect(css).toMatch(/a:focus-visible,\s*button:focus-visible\s*\{\s*outline: 2px solid var\(--color-kinnso-orange\)/)
  })

  it('keeps the legacy k-* utilities for studio/admin (retired in a later phase)', () => {
    for (const cls of ['.k-container', '.k-card', '.k-btn-primary', '.k-ticket', '.k-route-stamp']) {
      expect(css).toContain(cls)
    }
  })
})
