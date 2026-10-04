// @vitest-environment node
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

const repoRoot = resolve(process.cwd(), '../..')
const readRepo = (path: string) => readFileSync(resolve(repoRoot, path), 'utf8')
const FLAG = 'E2E_ALLOW_EXTERNAL_SCAN_SKIP'

describe('creator onboarding scan tolerance wiring', () => {
  it('keeps review-scan skipping behind an explicit strict-true live-external opt-in', () => {
    const source = readRepo('apps/e2e/specs/creator-onboarding.spec.ts')

    expect(source).toContain(
      `const allowExternalScanSkip = process.env.${FLAG} === 'true'`,
    )
    expect(source).toMatch(
      /test\.skip\(\s*!reviewReady && allowExternalScanSkip,/,
    )
    expect(source).toMatch(
      /expect\(reviewReady,\s*'Fixture-backed creator scan must reach review'\s*\)\.toBe\(true\)/,
    )
  })

  it('sets the opt-in only on deployed live verification, never fixture PR CI or nightly', () => {
    const verify = readRepo('.github/workflows/verify.yml')
    const ci = readRepo('.github/workflows/ci.yml')
    const nightly = readRepo('.github/workflows/nightly-funnel.yml')
    const r710Config = readRepo('apps/e2e/playwright.r7-10.config.ts')
    const r710Specs = readRepo('apps/e2e/r7-10-specs.ts')
    expect(r710Config).toContain("import { R7_10_OFF_SPECS } from './r7-10-specs'")
    expect(r710Config).toContain('[...R7_10_OFF_SPECS]')

    expect(verify).toMatch(
      /allow_external_scan_skip:\s*\r?\n\s+description: [^\r\n]+\r?\n\s+required: false\r?\n\s+type: boolean\r?\n\s+default: false/,
    )
    expect(verify).toContain(
      "E2E_ALLOW_EXTERNAL_SCAN_SKIP: ${{ github.event_name == 'deployment_status' || inputs.allow_external_scan_skip }}",
    )
    expect([verify, ci, nightly].join('\n').match(new RegExp(FLAG, 'g'))).toHaveLength(1)
    expect(ci).toContain('SCAN_FIXTURE_MODE=1')
    expect(ci).toContain("R7_10_BOOKING_STATE: 'off'")
    expect(ci).toContain('playwright.r7-10.config.ts')
    for (const spec of [
      'creator-onboarding.spec.ts',
      'funnel-smoke.spec.ts',
      'honesty.spec.ts',
      'notfound.spec.ts',
    ]) {
      expect(r710Specs).toContain(`'${spec}'`)
    }
    expect(ci).not.toContain(FLAG)
    expect(nightly).not.toContain(FLAG)
  })
})
