import type { CheckResult, ParityReport } from './types'

export function buildReport(results: CheckResult[]): ParityReport {
  const counts = { pass: 0, fail: 0, warn: 0 }
  for (const r of results) counts[r.status]++
  return { results, counts, ok: counts.fail === 0 }
}

export function renderTable(report: ParityReport): string {
  const icon = { pass: '✓', fail: '✗', warn: '!' } as const
  const lines = report.results.map((r) => `${icon[r.status]} [${r.check}] ${r.target} — ${r.detail}`)
  lines.push('')
  lines.push(
    `${report.ok ? 'PASS' : 'FAIL'} — ${report.counts.pass} pass, ${report.counts.fail} fail, ${report.counts.warn} warn`,
  )
  return lines.join('\n')
}
