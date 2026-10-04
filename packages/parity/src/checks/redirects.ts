import type { Check, CheckResult } from '../types'

/** Each redirect sample must return 301 with a Location whose pathname equals the expected target. */
export const redirects: Check = async ({ legacy, newstack }) => {
  const samples = await legacy.redirectSamples()
  const out: CheckResult[] = []
  for (const s of samples) {
    const { status, location } = await newstack.redirect(s.from)
    // Location may be relative (the proxy emits "/en/...") or absolute; resolve against a
    // placeholder base so either form yields the pathname, then compare pathname only.
    const got = location ? new URL(location, 'http://placeholder.invalid').pathname : null
    const ok = status === 301 && got === s.to
    out.push({
      check: 'redirects',
      target: s.from,
      status: ok ? 'pass' : 'fail',
      detail: `HTTP ${status} -> ${got ?? '(no Location)'} (want 301 -> ${s.to})`,
    })
  }
  return out
}
