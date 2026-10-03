import { describe, it, expect } from 'vitest'
import { reconcileJob, toRenderRows, type JobRow } from '@/lib/onboarding/progress'

const base: JobRow = {
  id: 'job-1',
  status: 'fetching',
  progress: { platforms: { instagram: 'pending', youtube: 'pending' } },
  error: null,
}

describe('reconcileJob', () => {
  it('takes the realtime row when it is newer than the initial snapshot', () => {
    const initial = { ...base, status: 'fetching' as const }
    const live = { ...base, status: 'analyzing' as const }
    expect(reconcileJob(initial, live).status).toBe('analyzing')
  })
  it('keeps a terminal initial snapshot if the realtime row is still in-flight', () => {
    // Subscribe-after-terminal: initial select already shows ready; a stale earlier
    // realtime frame must not regress the UI.
    const initial = { ...base, status: 'ready' as const }
    const stale = { ...base, status: 'fetching' as const }
    expect(reconcileJob(initial, stale).status).toBe('ready')
  })
  it('keeps terminal failed over a stale in-flight frame', () => {
    const initial = { ...base, status: 'failed' as const, error: 'boom' }
    const stale = { ...base, status: 'analyzing' as const }
    const out = reconcileJob(initial, stale)
    expect(out.status).toBe('failed')
    expect(out.error).toBe('boom')
  })
  it('advances to a terminal realtime frame from an in-flight initial', () => {
    const initial = { ...base, status: 'analyzing' as const }
    const live = { ...base, status: 'ready' as const }
    expect(reconcileJob(initial, live).status).toBe('ready')
  })
  it('returns the single row when the other is null', () => {
    expect(reconcileJob(base, null)).toBe(base)
    expect(reconcileJob(null, base)).toBe(base)
  })
})

describe('toRenderRows', () => {
  it('builds one row per requested platform with its signal status', () => {
    const rows = toRenderRows(
      { platforms: { instagram: 'ok', youtube: 'failed', threads: 'pending' } },
      ['instagram', 'youtube', 'threads'],
    )
    expect(rows).toEqual([
      { platform: 'instagram', state: 'ok' },
      { platform: 'youtube', state: 'failed' },
      { platform: 'threads', state: 'pending' },
    ])
  })
  it('defaults a missing platform entry to pending', () => {
    const rows = toRenderRows({ platforms: { instagram: 'ok' } }, ['instagram', 'youtube'])
    expect(rows).toEqual([
      { platform: 'instagram', state: 'ok' },
      { platform: 'youtube', state: 'pending' },
    ])
  })
  it('reads the thin flag', () => {
    expect(toRenderRows({ platforms: {}, thin: true }, []).length).toBe(0)
  })
})

describe('isThin', () => {
  it('is true only when progress.thin === true', async () => {
    const { isThin } = await import('@/lib/onboarding/progress')
    expect(isThin({ platforms: {}, thin: true })).toBe(true)
    expect(isThin({ platforms: {} })).toBe(false)
    expect(isThin(null)).toBe(false)
  })
})
