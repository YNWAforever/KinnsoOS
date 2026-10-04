import type { Check, CheckResult } from '../types'

/** Per-locale visible-translation counts must equal the baseline. Empty baseline => warn (skip). */
export const rowCounts: Check = async ({ legacy, newstack }) => {
  const baseline = await legacy.localeCounts()
  if (Object.keys(baseline).length === 0) {
    return [{ check: 'row-counts', target: '(all locales)', status: 'warn', detail: 'no baseline counts for this source mode' }]
  }
  const live = await newstack.localeCounts()
  const locales = new Set([...Object.keys(baseline), ...Object.keys(live)])
  const out: CheckResult[] = []
  for (const locale of [...locales].sort()) {
    const b = baseline[locale] ?? 0
    const g = live[locale] ?? 0
    out.push({
      check: 'row-counts',
      target: locale,
      status: b === g ? 'pass' : 'fail',
      detail: `baseline ${b} vs live ${g}`,
    })
  }
  return out
}
