'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { createSupabaseBrowserClient } from '@/lib/supabase/client'
import { reconcileJob, toRenderRows, type JobRow, type JobStatus } from '@/lib/onboarding/progress'
import type { Platform } from '@/lib/onboarding/validateHandle'
import type { Messages } from '@/lib/i18n/messages/en'

type ProgressDict = Messages['onboarding']['progressStep']

const PHASE_KEY: Record<JobStatus, keyof ProgressDict> = {
  queued: 'phaseQueued',
  fetching: 'phaseFetching',
  analyzing: 'phaseAnalyzing',
  ready: 'phaseReady',
  failed: 'phaseFailed',
}
const STATE_KEY = { pending: 'statePending', ok: 'stateOk', failed: 'stateFailed' } as const

type Notice = 'none' | 'rateLimited' | 'reauth' | 'error' | 'unconfigured'

type StepState = 'done' | 'active' | 'failed' | 'upcoming'

// The three visible steps of the scan journey. The worker's 4 statuses
// (queued/fetching/analyzing/ready) collapse onto these.
const STEPS: ReadonlyArray<{ key: string; titleKey: keyof ProgressDict; descKey: keyof ProgressDict }> = [
  { key: 'fetch', titleKey: 'phaseFetching', descKey: 'stepFetchingDesc' },
  { key: 'analyze', titleKey: 'phaseAnalyzing', descKey: 'stepAnalyzingDesc' },
  { key: 'ready', titleKey: 'stepReadyTitle', descKey: 'stepReadyDesc' },
]

// On failure the failing step is inferred from the error text (the worker drops
// the prior phase when it flips to 'failed'): a fetch-phase failure vs a later one.
function stepStatesFor(status: JobStatus, error: string | null): [StepState, StepState, StepState] {
  if (status === 'ready') return ['done', 'done', 'done']
  if (status === 'failed') {
    const fetchFailed = /platform fetches failed|no data to analyze/i.test(error ?? '')
    return fetchFailed ? ['failed', 'upcoming', 'upcoming'] : ['done', 'failed', 'upcoming']
  }
  if (status === 'analyzing') return ['done', 'active', 'upcoming']
  return ['active', 'upcoming', 'upcoming'] // queued | fetching
}

// Phase-capped progress: the bar grows with elapsed time so it never looks frozen
// during the ~40s analyze phase, but it can't pass the active phase's ceiling — so
// it stays honest (won't show 90% while still fetching).
const PHASE_CEIL: Record<JobStatus, number> = {
  queued: 12,
  fetching: 55,
  analyzing: 93,
  ready: 100,
  failed: 93,
}

function StepBullet({ state }: { state: StepState }) {
  if (state === 'done') {
    return (
      <span className="flex size-6 flex-none items-center justify-center rounded-full bg-green-100 text-green-700">
        <svg viewBox="0 0 20 20" className="size-3.5" fill="none" stroke="currentColor" strokeWidth={2.5} aria-hidden="true">
          <path d="M5 10.5l3 3 7-7" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      </span>
    )
  }
  if (state === 'active') {
    return (
      <span className="size-6 flex-none animate-spin rounded-full border-2 border-kinnso-ink/20 border-t-kinnso-ink" aria-hidden="true" />
    )
  }
  if (state === 'failed') {
    return (
      <span className="flex size-6 flex-none items-center justify-center rounded-full bg-red-100 text-red-700">
        <svg viewBox="0 0 20 20" className="size-3.5" fill="none" stroke="currentColor" strokeWidth={2.5} aria-hidden="true">
          <path d="M6 6l8 8M14 6l-8 8" strokeLinecap="round" />
        </svg>
      </span>
    )
  }
  return <span className="size-6 flex-none rounded-full border-2 border-kinnso-ink/15" aria-hidden="true" />
}

async function bearer(): Promise<string | null> {
  const supabase = createSupabaseBrowserClient()
  const {
    data: { session },
  } = await supabase.auth.getSession()
  return session?.access_token ?? null
}

export function LiveProgress({
  creatorId,
  jobId,
  platforms,
  t,
  onReady,
}: {
  creatorId: string
  jobId: string | null
  platforms: Platform[]
  t: ProgressDict
  onReady: (jobId: string) => void
}) {
  const [job, setJob] = useState<JobRow | null>(null)
  const [notice, setNotice] = useState<Notice>('none')
  const [elapsed, setElapsed] = useState(0)
  const jobIdRef = useRef<string | null>(jobId)
  const readyFiredRef = useRef(false)
  const scanStartRef = useRef<Promise<string | null> | null>(null)
  // Single owner for the live subscription's disposer. Both the mount effect
  // and retry() re-subscribe, and a subscription that outlives its job keeps
  // polling it: reconcileJob arbitrates purely by status rank, with no job-id
  // check, so a stale poller on the FAILED job would immediately drag a fresh
  // retry back to 'failed'.
  const cleanupRef = useRef<(() => void) | undefined>(undefined)

  // Pure: React invokes a state updater during the render phase whenever an
  // update is already queued (it only evaluates a lone one eagerly at dispatch).
  // onReady is a parent side effect — WizardClient calls router.refresh() and
  // setStep from it — so firing it in here updated the parent and the Router
  // mid-render. The ready hand-off belongs in an effect, below.
  const applyJob = useCallback((incoming: JobRow | null) => {
    setJob((prev) => reconcileJob(prev, incoming))
  }, [])

  useEffect(() => {
    if (job?.status !== 'ready' || readyFiredRef.current) return
    readyFiredRef.current = true
    onReady(job.id)
  }, [job, onReady])

  // POST a fresh scan to the worker; returns the jobId or sets a notice.
  const startScan = useCallback(async (path: string): Promise<string | null> => {
    // The scan worker runs as a separate service (Railway); the web app reaches
    // it via NEXT_PUBLIC_SCAN_URL, inlined at build time. If it's missing or not
    // an absolute URL, an empty value would make fetch() POST to the web app's own
    // origin (e.g. `/scan`) — a silent 404/redirect that strands the wizard. Fail
    // loudly instead of pretending to start a scan.
    const base = process.env.NEXT_PUBLIC_SCAN_URL?.trim()
    if (!base || !/^https?:\/\//i.test(base)) {
      console.error(
        '[scan] NEXT_PUBLIC_SCAN_URL is not configured (got %o) — cannot start scan. ' +
          'Point it at the deployed scan worker and redeploy the web app.',
        process.env.NEXT_PUBLIC_SCAN_URL,
      )
      setNotice('unconfigured')
      return null
    }
    const token = await bearer()
    if (!token) {
      setNotice('reauth')
      return null
    }
    const res = await fetch(`${base}${path}`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}` },
    })
    if (res.status === 429) {
      setNotice('rateLimited')
      return null
    }
    if (res.status === 401) {
      setNotice('reauth')
      return null
    }
    if (!res.ok) {
      setNotice('error')
      return null
    }
    const data = (await res.json()) as { jobId?: string }
    return data.jobId ?? null
  }, [])

  // Subscribe to the job row, then do the initial select + reconcile.
  const subscribeAndSelect = useCallback(
    (id: string) => {
      const supabase = createSupabaseBrowserClient()
      const channel = supabase
        .channel(`scan-job-${id}`)
        .on(
          'postgres_changes',
          { event: 'UPDATE', schema: 'public', table: 'creator_scan_jobs', filter: `id=eq.${id}` },
          (payload: { new: JobRow }) => applyJob(payload.new),
        )
        .subscribe()

      // Polling backstop: Realtime postgres_changes on the RLS-protected jobs table
      // can be missed (socket-auth / connection timing), which would otherwise strand
      // the wizard forever. Re-select until the job reaches a terminal state.
      let timer: ReturnType<typeof setInterval> | undefined
      const select = (): PromiseLike<void> =>
        supabase
          .from('creator_scan_jobs')
          .select('id, status, progress, error')
          .eq('id', id)
          .single()
          .then(({ data }) => {
            const row = data as JobRow | null
            applyJob(row)
            if (row && (row.status === 'ready' || row.status === 'failed') && timer) {
              clearInterval(timer)
              timer = undefined
            }
          })

      // Initial select AFTER subscribe so a terminal-before-subscribe job reconciles in.
      void select()
      timer = setInterval(() => void select(), 2000)

      return () => {
        if (timer) clearInterval(timer)
        supabase.removeChannel(channel)
      }
    },
    [applyJob],
  )

  // Dispose whatever subscription is currently live, then attach a new one.
  const resubscribe = useCallback(
    (id: string) => {
      cleanupRef.current?.()
      cleanupRef.current = subscribeAndSelect(id)
    },
    [subscribeAndSelect],
  )

  useEffect(() => {
    let cancelled = false
    ;(async () => {
      let id = jobIdRef.current
      if (!id) {
        // React Strict Mode replays effects in development. Share the in-flight
        // request across that replay so one click creates exactly one scan job.
        const pendingStart = scanStartRef.current ?? startScan('/scan')
        scanStartRef.current = pendingStart
        id = await pendingStart
        if (scanStartRef.current === pendingStart) scanStartRef.current = null
        if (!id || cancelled) return
        jobIdRef.current = id
      }
      resubscribe(id)
    })()
    return () => {
      cancelled = true
      cleanupRef.current?.()
      cleanupRef.current = undefined
    }
    // creatorId is included so a different creator remounts the subscription.
  }, [creatorId, startScan, resubscribe])

  // Tick the elapsed-seconds counter once per second; stop once the job reaches a
  // terminal state or a notice blocks the scan.
  useEffect(() => {
    const stopped = job?.status === 'ready' || job?.status === 'failed' || notice !== 'none'
    if (stopped) return
    const id = setInterval(() => setElapsed((e) => e + 1), 1000)
    return () => clearInterval(id)
  }, [job?.status, notice])

  async function retry() {
    const id = jobIdRef.current
    if (!id) return
    readyFiredRef.current = false
    setNotice('none')
    setJob(null)
    // Drop the failed job's subscription before the request, not after: its
    // 2s poller would otherwise keep re-applying status 'failed' over the
    // retry we are about to start.
    cleanupRef.current?.()
    cleanupRef.current = undefined
    const newId = await startScan(`/scan/${id}/retry`)
    if (newId) {
      jobIdRef.current = newId
      resubscribe(newId)
    }
  }

  const status: JobStatus = job?.status ?? 'queued'
  const blockingNotice = notice !== 'none'
  const rows = toRenderRows(job?.progress ?? null, platforms)
  const steps: [StepState, StepState, StepState] =
    blockingNotice && !job ? ['failed', 'upcoming', 'upcoming'] : stepStatesFor(status, job?.error ?? null)
  const barPct = status === 'ready' ? 100 : Math.min(PHASE_CEIL[status], Math.round(elapsed * 1.7))
  const mmss = `${Math.floor(elapsed / 60)}:${String(elapsed % 60).padStart(2, '0')}`

  return (
    <section className="w-full max-w-md space-y-5">
      <h2 className="text-xl font-semibold">{t.heading}</h2>
      {/* Screen-reader live region announcing the current phase. */}
      <p className="sr-only" role="status" aria-live="polite">
        {`${t.heading}: ${t[PHASE_KEY[status]]}`}
      </p>

      <div
        className="h-1.5 w-full overflow-hidden rounded-full bg-kinnso-ink/10"
        role="progressbar"
        aria-label={t.heading}
        aria-valuenow={barPct}
        aria-valuemin={0}
        aria-valuemax={100}
      >
        <div
          className="h-full rounded-full bg-kinnso-ink transition-[width] duration-700 ease-linear"
          style={{ width: `${barPct}%` }}
        />
      </div>

      <ol className="space-y-3.5">
        {STEPS.map((s, i) => {
          const st = steps[i]
          return (
            <li key={s.key} className="flex items-start gap-3">
              <StepBullet state={st} />
              <div className={st === 'upcoming' ? 'opacity-50' : undefined}>
                <p className="text-sm font-medium">{t[s.titleKey]}</p>
                <p className={`text-xs ${st === 'active' ? 'text-kinnso-ink/60' : 'text-kinnso-ink/45'}`}>{t[s.descKey]}</p>
                {i === 0 && platforms.length > 1 ? (
                  <ul className="mt-1 flex flex-wrap gap-x-3 gap-y-0.5">
                    {rows.map((r) => (
                      <li key={r.platform} className="text-[11px] text-kinnso-ink/50">
                        <span className="capitalize">{r.platform}</span> · {t[STATE_KEY[r.state]]}
                      </li>
                    ))}
                  </ul>
                ) : null}
              </div>
            </li>
          )
        })}
      </ol>

      {!blockingNotice && status !== 'failed' ? (
        <p className="flex items-center gap-1.5 border-t border-kinnso-ink/10 pt-3 text-xs text-kinnso-ink/50">
          <svg viewBox="0 0 20 20" className="size-3.5 flex-none" fill="none" stroke="currentColor" strokeWidth={1.8} aria-hidden="true">
            <circle cx="10" cy="10" r="7.5" />
            <path d="M10 6v4l2.5 2" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
          <span>
            {t.timeHint} · {mmss} {t.elapsed}
          </span>
        </p>
      ) : null}

      {notice === 'rateLimited' ? <p className="text-sm text-amber-600">{t.rateLimited}</p> : null}
      {notice === 'reauth' ? <p className="text-sm text-red-600">{t.reauth}</p> : null}
      {notice === 'error' ? <p className="text-sm text-red-600">{t.error}</p> : null}
      {notice === 'unconfigured' ? <p className="text-sm text-red-600">{t.unconfigured}</p> : null}

      {status === 'failed' ? (
        <button
          type="button"
          className="rounded bg-kinnso-ink px-4 py-2 text-sm font-medium text-white"
          onClick={retry}
        >
          {t.retry}
        </button>
      ) : null}
    </section>
  )
}
