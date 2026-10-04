// @vitest-environment jsdom
import { StrictMode, useState } from 'react'
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { act, render, screen, fireEvent, waitFor, cleanup } from '@testing-library/react'
import type { JobRow } from '@/lib/onboarding/progress'

afterEach(cleanup)

// ---- Fake Realtime channel: capture the handler so the test can emit frames ----
let emit: ((row: JobRow) => void) | null = null
const channelObj = {
  on: vi.fn((_evt: string, _filter: unknown, cb: (p: { new: JobRow }) => void) => {
    emit = (row: JobRow) => cb({ new: row })
    return channelObj
  }),
  subscribe: vi.fn((cb?: (s: string) => void) => {
    cb?.('SUBSCRIBED')
    return channelObj
  }),
}

// ---- Mutable initial-select result, set per test ----
let initialJob: JobRow = {
  id: 'job-1',
  status: 'fetching',
  progress: { platforms: { instagram: 'pending' } },
  error: null,
}
const single = vi.fn(async () => ({ data: initialJob, error: null }))
const eq = vi.fn(() => ({ single }))
const select = vi.fn(() => ({ eq }))
const from = vi.fn(() => ({ select }))
const getSession = vi.fn(async () => ({
  data: { session: { access_token: 'tok-123' } },
}))
const removeChannel = vi.fn()

vi.mock('@/lib/supabase/client', () => ({
  createSupabaseBrowserClient: () => ({
    channel: vi.fn(() => channelObj),
    removeChannel,
    from,
    auth: { getSession },
  }),
}))

import { LiveProgress } from '@/components/onboarding/LiveProgress'
import en from '@/lib/i18n/messages/en'
const t = en.onboarding.progressStep

beforeEach(() => {
  emit = null
  process.env.NEXT_PUBLIC_SCAN_URL = 'http://scan.test'
  globalThis.fetch = vi.fn()
  initialJob = {
    id: 'job-1',
    status: 'fetching',
    progress: { platforms: { instagram: 'pending', youtube: 'pending' } },
    error: null,
  }
})
afterEach(() => vi.clearAllMocks())

describe('LiveProgress (fresh run -> live frames)', () => {
  it('shares one scan start across Strict Mode effect replay', async () => {
    let resolveResponse: ((value: { status: number; ok: boolean; json: () => Promise<{ jobId: string }> }) => void) | undefined
    const scanResponse = new Promise<{ status: number; ok: boolean; json: () => Promise<{ jobId: string }> }>((resolve) => {
      resolveResponse = resolve
    })
    ;(globalThis.fetch as ReturnType<typeof vi.fn>).mockReturnValue(scanResponse)

    render(
      <StrictMode>
        <LiveProgress
          creatorId="c1"
          jobId={null}
          platforms={['instagram']}
          t={t}
          onReady={vi.fn()}
        />
      </StrictMode>,
    )

    await act(async () => {
      await Promise.resolve()
      await Promise.resolve()
    })
    expect(globalThis.fetch).toHaveBeenCalledTimes(1)

    await act(async () => {
      resolveResponse?.({
        status: 202,
        ok: true,
        json: async () => ({ jobId: 'job-1' }),
      })
      await scanResponse
    })
    await waitFor(() => expect(single).toHaveBeenCalled())
  })

  it('POSTs /scan, subscribes, then advances queued->analyzing->ready and calls onReady', async () => {
    ;(globalThis.fetch as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
      status: 202,
      ok: true,
      json: async () => ({ jobId: 'job-1' }),
    })
    const onReady = vi.fn()
    render(
      <LiveProgress
        creatorId="c1"
        jobId={null}
        platforms={['instagram', 'youtube']}
        t={t}
        onReady={onReady}
      />,
    )
    // POST fired with bearer token
    await waitFor(() =>
      expect(globalThis.fetch).toHaveBeenCalledWith('http://scan.test/scan', {
        method: 'POST',
        headers: { Authorization: 'Bearer tok-123' },
      }),
    )
    // initial select reconciled -> still fetching phase visible
    await waitFor(() => expect(screen.getByText(t.phaseFetching)).toBeTruthy())
    // emit analyzing then ready
    emit?.({ id: 'job-1', status: 'analyzing', progress: { platforms: { instagram: 'ok', youtube: 'pending' } }, error: null })
    await waitFor(() => expect(screen.getByText(t.phaseAnalyzing)).toBeTruthy())
    emit?.({ id: 'job-1', status: 'ready', progress: { platforms: { instagram: 'ok', youtube: 'ok' } }, error: null })
    await waitFor(() => expect(onReady).toHaveBeenCalledWith('job-1'))
  })
})

describe('LiveProgress (subscribe-after-terminal reconcile)', () => {
  it('shows ready immediately from the initial select even if no realtime frame arrives', async () => {
    initialJob = { id: 'job-1', status: 'ready', progress: { platforms: { instagram: 'ok' } }, error: null }
    const onReady = vi.fn()
    render(
      <LiveProgress creatorId="c1" jobId="job-1" platforms={['instagram']} t={t} onReady={onReady} />,
    )
    // No POST when resuming with an existing jobId.
    expect(globalThis.fetch).not.toHaveBeenCalled()
    await waitFor(() => expect(onReady).toHaveBeenCalledWith('job-1'))
  })

  // onReady is a parent side effect — WizardClient calls router.refresh() and
  // setStep('review') from it. Firing it inside the setJob updater ran it during
  // LiveProgress's render, so the parent (and the Router) were updated mid-render.
  it('advances the parent without updating it during render', async () => {
    const errors: string[] = []
    const spy = vi.spyOn(console, 'error').mockImplementation((...args: unknown[]) => {
      errors.push(String(args[0]))
    })

    function Parent() {
      const [step, setStep] = useState('progress')
      if (step === 'review') return <p>review</p>
      return (
        <LiveProgress
          creatorId="c1"
          jobId="job-1"
          platforms={['instagram']}
          t={t}
          onReady={() => setStep('review')}
        />
      )
    }

    render(<Parent />)
    await waitFor(() => expect(screen.getByText(t.phaseFetching)).toBeTruthy())
    // Two frames in one batch. React evaluates a lone setState updater eagerly at
    // dispatch (outside render), so a single frame hides the bug; with an update
    // already queued the updater is deferred to the render phase, which is exactly
    // where the production warning came from.
    await act(async () => {
      emit?.({ id: 'job-1', status: 'analyzing', progress: { platforms: { instagram: 'ok' } }, error: null })
      emit?.({ id: 'job-1', status: 'ready', progress: { platforms: { instagram: 'ok' } }, error: null })
    })

    await waitFor(() => expect(screen.getByText('review')).toBeTruthy())
    expect(errors.filter((e) => e.includes('Cannot update a component'))).toEqual([])
    spy.mockRestore()
  })
})

describe('LiveProgress (unconfigured scan URL)', () => {
  it('does not POST and shows the unconfigured notice when NEXT_PUBLIC_SCAN_URL is empty', async () => {
    process.env.NEXT_PUBLIC_SCAN_URL = ''
    const errSpy = vi.spyOn(console, 'error').mockImplementation(() => {})
    render(<LiveProgress creatorId="c1" jobId={null} platforms={['instagram']} t={t} onReady={vi.fn()} />)
    await waitFor(() => expect(screen.getByText(t.unconfigured)).toBeTruthy())
    // Critically: it never POSTs to the web app's own origin.
    expect(globalThis.fetch).not.toHaveBeenCalled()
    expect(errSpy).toHaveBeenCalled()
    errSpy.mockRestore()
  })

  it('does not POST when NEXT_PUBLIC_SCAN_URL is a non-absolute (relative) value', async () => {
    process.env.NEXT_PUBLIC_SCAN_URL = '/scan-proxy'
    const errSpy = vi.spyOn(console, 'error').mockImplementation(() => {})
    render(<LiveProgress creatorId="c1" jobId={null} platforms={['instagram']} t={t} onReady={vi.fn()} />)
    await waitFor(() => expect(screen.getByText(t.unconfigured)).toBeTruthy())
    expect(globalThis.fetch).not.toHaveBeenCalled()
    errSpy.mockRestore()
  })
})

describe('LiveProgress (429 + retry)', () => {
  it('shows the rate-limit message on 429', async () => {
    ;(globalThis.fetch as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
      status: 429,
      ok: false,
      json: async () => ({}),
    })
    render(<LiveProgress creatorId="c1" jobId={null} platforms={['instagram']} t={t} onReady={vi.fn()} />)
    await waitFor(() => expect(screen.getByText(t.rateLimited)).toBeTruthy())
  })

  it('shows an error notice when POST /scan returns 500', async () => {
    ;(globalThis.fetch as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
      status: 500,
      ok: false,
      json: async () => ({ error: 'internal error' }),
    })
    render(<LiveProgress creatorId="c1" jobId={null} platforms={['instagram']} t={t} onReady={vi.fn()} />)
    await waitFor(() => expect(screen.getByText(t.error)).toBeTruthy())
  })

  it('renders Retry on a failed initial job and POSTs the retry endpoint', async () => {
    initialJob = { id: 'job-1', status: 'failed', progress: { platforms: { instagram: 'failed' } }, error: 'boom' }
    ;(globalThis.fetch as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
      status: 202,
      ok: true,
      json: async () => ({ jobId: 'job-1' }),
    })
    render(<LiveProgress creatorId="c1" jobId="job-1" platforms={['instagram']} t={t} onReady={vi.fn()} />)
    await waitFor(() => expect(screen.getByRole('button', { name: t.retry })).toBeTruthy())
    fireEvent.click(screen.getByRole('button', { name: t.retry }))
    await waitFor(() =>
      expect(globalThis.fetch).toHaveBeenCalledWith('http://scan.test/scan/job-1/retry', {
        method: 'POST',
        headers: { Authorization: 'Bearer tok-123' },
      }),
    )
  })

  // An unnamed progressbar is a serious axe violation, and this one sits on the
  // scan screen the studio sends creators to while a scan is running.
  it('gives the progress bar an accessible name', async () => {
    // An existing jobId, so the component subscribes to the job it was handed
    // rather than POSTing a scan start. The shared `globalThis.fetch = vi.fn()`
    // resolves to undefined, so touching that path would leave a rejection that
    // outlives the test and fails the run as an unhandled error.
    render(<LiveProgress creatorId="c1" jobId="job-1" platforms={['instagram']} t={t} onReady={vi.fn()} />)
    await waitFor(() => expect(screen.getByRole('progressbar', { name: t.heading })).toBeTruthy())
    expect(globalThis.fetch).not.toHaveBeenCalled()
  })
})
