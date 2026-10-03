'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { createSupabaseBrowserClient } from '@/lib/supabase/client'
import { retryVerification } from '@/lib/missions/verify-client'
import type { Messages } from '@/lib/i18n/messages/en'

type JobStatus = 'queued' | 'fetching' | 'ready' | 'failed'
type JobRow = { id: string; status: JobStatus; confidence_status: string | null; error: string | null }

type Props = { jobId: string; t: Messages['missionDetail'] }

export function SubmissionVerification({ jobId, t }: Props) {
  const [job, setJob] = useState<JobRow | null>(null)
  const currentId = useRef(jobId)
  const cleanupRef = useRef<(() => void) | null>(null)

  const subscribeAndSelect = useCallback((id: string) => {
    const supabase = createSupabaseBrowserClient()
    const channel = supabase
      .channel(`verify-job-${id}`)
      .on(
        'postgres_changes',
        { event: 'UPDATE', schema: 'public', table: 'mission_verification_jobs', filter: `id=eq.${id}` },
        (payload: { new: JobRow }) => setJob(payload.new),
      )
      .subscribe()

    let timer: ReturnType<typeof setInterval> | undefined
    let stopped = false

    const select = (): PromiseLike<void> =>
      supabase
        .from('mission_verification_jobs')
        .select('id, status, confidence_status, error')
        .eq('id', id)
        .single()
        .then(({ data }) => {
          const data_ = data as JobRow | null
          setJob(data_)
          if (data_ && (data_.status === 'ready' || data_.status === 'failed') && !stopped) {
            stopped = true
            if (timer) {
              clearInterval(timer)
              timer = undefined
            }
          }
        })

    void select()
    if (!stopped) {
      timer = setInterval(() => void select(), 2000)
    }
    return () => {
      if (timer) clearInterval(timer)
      supabase.removeChannel(channel)
    }
  }, [])

  useEffect(() => {
    currentId.current = jobId
    cleanupRef.current = subscribeAndSelect(jobId)
    return () => cleanupRef.current?.()
  }, [jobId, subscribeAndSelect])

  async function retry() {
    const newId = await retryVerification(currentId.current)
    if (newId) {
      cleanupRef.current?.()
      currentId.current = newId
      setJob(null)
      cleanupRef.current = subscribeAndSelect(newId)
    }
  }

  if (!job || job.status === 'queued' || job.status === 'fetching') {
    return <p className="mt-2 text-xs text-kinnso-muted">{t.verifying}</p>
  }
  if (job.status === 'failed') {
    return (
      <div className="mt-2 flex items-center gap-2 text-xs text-red-700">
        <span>{t.verificationFailed}</span>
        <button type="button" className="k-btn-ghost text-xs" onClick={() => void retry()}>{t.retry}</button>
      </div>
    )
  }
  // ready
  const label =
    job.confidence_status === 'verified_signal' ? t.verifiedSignal
    : job.confidence_status === 'needs_review' ? t.needsReview
    : t.couldntVerify
  return <p className="mt-2 text-xs font-semibold text-kinnso-ink">{label}</p>
}
