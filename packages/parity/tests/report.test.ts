import { describe, it, expect } from 'vitest'
import { buildReport, renderTable } from '../src/report'
import type { CheckResult } from '../src/types'

const results: CheckResult[] = [
  { check: 'url-coverage', target: '/en/articles/dining/ramen-guide', status: 'pass', detail: 'HTTP 200' },
  { check: 'negative-404', target: '/en/articles/shopping/draft-article', status: 'fail', detail: 'HTTP 200 (want 404)' },
  { check: 'row-counts', target: '(all locales)', status: 'warn', detail: 'skipped' },
]

describe('report', () => {
  it('rolls up counts and sets ok=false when any fail exists', () => {
    const report = buildReport(results)
    expect(report.counts).toEqual({ pass: 1, fail: 1, warn: 1 })
    expect(report.ok).toBe(false)
  })

  it('ok=true when there are zero fails (warns allowed)', () => {
    const report = buildReport([results[0], results[2]])
    expect(report.ok).toBe(true)
  })

  it('renders a human table with a summary line', () => {
    const text = renderTable(buildReport(results))
    expect(text).toContain('[url-coverage]')
    expect(text).toContain('FAIL — 1 pass, 1 fail, 1 warn')
  })
})
