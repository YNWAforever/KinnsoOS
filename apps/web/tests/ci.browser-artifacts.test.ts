import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { expect, it } from 'vitest'

const workflow = readFileSync(resolve(process.cwd(), '../../.github/workflows/ci.yml'), 'utf8')
  .replace(/\r\n/g, '\n')
const steps = [...workflow.matchAll(/^ {6}- name: (.+)\n([\s\S]*?)(?=^ {6}- (?:name:|uses:)|(?![\s\S]))/gm)]
  .map(match => ({ name: match[1], source: match[0] }))

it.each([
  ['R7.10 accessibility - Booking OFF', 'booking_off', 'e2e-booking-off-artifacts'],
  ['Profile enquiries journey (local stack)', 'profile_enquiries', 'e2e-profile-enquiries-artifacts'],
  ['R7.10 accessibility - Booking ON', 'booking_on', 'e2e-booking-on-artifacts'],
])('retains %s evidence before the next surface can overwrite it', (name, id, artifact) => {
  const index = steps.findIndex(step => step.name === name)
  expect(index).toBeGreaterThanOrEqual(0)
  expect(steps[index].source).toContain(`        id: ${id}\n`)
  const upload = steps[index + 1]?.source ?? ''
  expect(upload).toContain('uses: actions/upload-artifact@043fb46d1a93c77aae656e7c1c64a875d1fc6a0a')
  // A failed surface must retain its evidence. A skipped surface must not relabel
  // the previous surface's still-present report as its own.
  expect(upload).toContain(`if: always() && (steps.${id}.outcome == 'success' || steps.${id}.outcome == 'failure')`)
  expect(upload).toContain(`name: ${artifact}\n`)
  expect(upload).toContain('            apps/e2e/test-results/')
  expect(upload).toContain('            apps/e2e/playwright-report/')
  expect(upload).not.toContain('continue-on-error:')
})
