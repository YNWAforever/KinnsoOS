import type { SupabaseClient } from '@supabase/supabase-js'
import type { Database } from '@kinnso/db'
import { reserveLaunch, type HandlerResult } from './launch-reservation'

export interface ScanRetryDeps {
  db: SupabaseClient<Database>
  userId: string
  run: (jobId: string) => Promise<void>
}

async function launchScan(deps: ScanRetryDeps, jobId?: string): Promise<HandlerResult> {
  const reserved = await reserveLaunch(deps.db, { kind: 'scan', creatorId: deps.userId, jobId })
  if ('status' in reserved) return reserved

  deps.run(reserved.jobId).catch((err: unknown) => {
    console.error(`[scan] unhandled pipeline error for job ${reserved.jobId}`, err)
  })
  return { status: 202, body: { jobId: reserved.jobId, ...(jobId ? { retrying: true } : {}) } }
}

export function handleScan(deps: ScanRetryDeps): Promise<HandlerResult> {
  return launchScan(deps)
}

export function handleScanRetry(deps: ScanRetryDeps, input: { jobId: string }): Promise<HandlerResult> {
  return launchScan(deps, input.jobId)
}
