import type { Check, CheckResult } from '../types'

/** Draft / expired / missing-locale paths must return 404. */
export const negative404: Check = async ({ legacy, newstack }) => {
  const paths = await legacy.negativePaths()
  if (paths.length === 0) {
    return [{ check: 'negative-404', target: '(none)', status: 'warn', detail: 'no negative fixtures for this source mode' }]
  }
  const out: CheckResult[] = []
  for (const p of paths) {
    const status = await newstack.status(p)
    out.push({
      check: 'negative-404',
      target: p,
      status: status === 404 ? 'pass' : 'fail',
      detail: `HTTP ${status} (want 404)`,
    })
  }
  return out
}
