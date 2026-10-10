import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { expect, it } from 'vitest'

const workflow = readFileSync(resolve(process.cwd(), '../../.github/workflows/ci.yml'), 'utf8')
  .replace(/\r\n/g, '\n')
const surfaces = [
  ['R7.10 accessibility - Booking OFF', 'booking_off', 'e2e-booking-off-artifacts', 'booking-off'],
  ['Profile enquiries journey (local stack)', 'profile_enquiries', 'e2e-profile-enquiries-artifacts', 'profile-enquiries'],
  ['R7.10 accessibility - Booking ON', 'booking_on', 'e2e-booking-on-artifacts', 'booking-on'],
] as const

function scalar(source: string, key: string, indent = 8) {
  const matches = [...source.matchAll(new RegExp(`^ {${indent}}${key}: (.+)$`, 'gm'))]
  return matches.length === 1 ? matches[0][1].replace(/\s+#.*$/, '') : undefined
}

function phaseEvidenceContract(source: string, [name, id, artifact, phase]: typeof surfaces[number]) {
  const steps = [...source.matchAll(/^ {6}- name: (.+)\n([\s\S]*?)(?=^ {6}- (?:name:|uses:)|(?![\s\S]))/gm)]
    .map(match => ({ name: match[1], source: match[0] }))
  const index = steps.findIndex(step => step.name === name)
  if (index < 0 || steps.filter(step => step.name === name).length !== 1) return false
  const suite = steps[index].source
  const collector = steps[index + 1]?.source ?? ''
  const upload = steps[index + 2]?.source ?? ''
  // A failed surface must retain its evidence. A skipped surface must not relabel
  // the previous surface's report as its own. Only the phase-bound collector may
  // intervene before the upload; the next suite cannot overwrite either snapshot.
  const condition = `always() && (steps.${id}.outcome == 'success' || steps.${id}.outcome == 'failure')`
  const command = `node scripts/collect-next-manifest-evidence.mjs --phase ${phase} --outcome '\${{ steps.${id}.outcome }}'`
  const paths = upload.match(/^ {10}path: \|\n((?: {12}.+\n)+)/m)?.[1].trim().split('\n').map(line => line.trim()) ?? []
  const expected = [
    'apps/e2e/test-results/', 'apps/e2e/playwright-report/',
    `apps/e2e/next-manifest-evidence/next-manifests-${phase}.json`,
  ]
  return scalar(suite, 'id') === id
    && scalar(collector, 'if') === condition && scalar(collector, 'run') === command
    && scalar(upload, 'uses') === 'actions/upload-artifact@043fb46d1a93c77aae656e7c1c64a875d1fc6a0a'
    && scalar(upload, 'if') === condition && scalar(upload, 'name', 10) === artifact
    && paths.length === expected.length && expected.every(path => paths.includes(path))
    && [suite, collector, upload].every(step => !/^ {8}continue-on-error:/m.test(step))
}

it.each(surfaces)('retains %s browser and manifest evidence before the next surface', (...surface) => {
  expect(phaseEvidenceContract(workflow, surface)).toBe(true)
})

for (const surface of surfaces) {
  const [name, id, , phase] = surface
  const command = `node scripts/collect-next-manifest-evidence.mjs --phase ${phase} --outcome '\${{ steps.${id}.outcome }}'`
  const condition = `always() && (steps.${id}.outcome == 'success' || steps.${id}.outcome == 'failure')`
  it(`${name}: rejects missing collection`, () => {
    expect(phaseEvidenceContract(workflow.replace(`        run: ${command}`, '        run: echo missing'), surface)).toBe(false)
  })
  it(`${name}: rejects a collector that skips failed suites`, () => {
    expect(phaseEvidenceContract(workflow.replace(`        if: ${condition}\n        run: ${command}`,
      `        if: steps.${id}.outcome == 'success'\n        run: ${command}`), surface)).toBe(false)
  })
  it(`${name}: rejects a different phase outcome`, () => {
    expect(phaseEvidenceContract(workflow.replace(command, command.replace(`steps.${id}.outcome`, 'steps.other.outcome')), surface)).toBe(false)
  })
  it(`${name}: rejects an upload without the matching manifest receipt`, () => {
    expect(phaseEvidenceContract(workflow.replace(`            apps/e2e/next-manifest-evidence/next-manifests-${phase}.json\n`, ''), surface)).toBe(false)
  })
}
