/**
 * Pure resume-routing decision for the onboarding wizard (SP2 §6).
 * The host server component reads the live state and calls this on every load.
 *
 * Inputs:
 *  - creatorStatus: `creators.status` ('onboarding' | 'active') or null if the row
 *    has not yet been created (trigger lag immediately after sign-up).
 *  - latestJob: the most recent `creator_scan_jobs` row for this creator, or null.
 *  - handlesCount: number of saved `creator_social_handles` rows.
 */
export type CreatorStatus = 'onboarding' | 'active'
export type JobStatus = 'queued' | 'fetching' | 'analyzing' | 'ready' | 'failed'
export interface JobSnapshot {
  id: string
  status: JobStatus
}

export type Step = 'wait' | 'handles' | 'progress' | 'review' | 'retry' | 'done'

export function resumeStep(
  creatorStatus: CreatorStatus | null,
  latestJob: JobSnapshot | null,
  handlesCount: number,
): Step {
  // Trigger lag: the creators row has not appeared yet — show a brief wait/refresh.
  if (creatorStatus === null) return 'wait'

  // Published creator — onboarding is complete; show the read-back.
  if (creatorStatus === 'active') return 'done'

  // creatorStatus === 'onboarding' from here on.
  if (latestJob === null) return 'handles'

  switch (latestJob.status) {
    case 'queued':
    case 'fetching':
    case 'analyzing':
      return 'progress'
    case 'ready':
      return 'review'
    case 'failed':
      return 'retry'
  }
}
