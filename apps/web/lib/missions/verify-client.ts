import { createSupabaseBrowserClient } from '@/lib/supabase/client'

async function bearer(): Promise<string | null> {
  const supabase = createSupabaseBrowserClient()
  const { data: { session } } = await supabase.auth.getSession()
  return session?.access_token ?? null
}

function workerBase(): string | null {
  const base = process.env.NEXT_PUBLIC_SCAN_URL?.trim()
  return base && /^https?:\/\//i.test(base) ? base : null
}

export type StartVerificationResult =
  | { jobId: string }
  | { error: 'unconfigured' | 'reauth' | 'rateLimited' | 'error' }

export async function startVerification(submissionId: string): Promise<StartVerificationResult> {
  const base = workerBase()
  if (!base) return { error: 'unconfigured' }
  const token = await bearer()
  if (!token) return { error: 'reauth' }
  const res = await fetch(`${base}/verify-submission`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ submissionId }),
  })
  if (res.status === 429) return { error: 'rateLimited' }
  if (res.status === 401) return { error: 'reauth' }
  if (!res.ok) return { error: 'error' }
  const data = (await res.json()) as { jobId?: string }
  return data.jobId ? { jobId: data.jobId } : { error: 'error' }
}

export async function retryVerification(jobId: string): Promise<string | null> {
  const base = workerBase()
  if (!base) return null
  const token = await bearer()
  if (!token) return null
  const res = await fetch(`${base}/verify-submission/${jobId}/retry`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}` },
  })
  if (!res.ok) return null
  const data = (await res.json()) as { jobId?: string }
  return data.jobId ?? null
}
