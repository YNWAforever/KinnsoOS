/** Shared mature onboarding decision; the original host re-exports this module. */
export type CreatorStatus = 'onboarding' | 'active';
export type JobStatus = 'queued' | 'fetching' | 'analyzing' | 'ready' | 'failed';
export interface JobSnapshot { id: string; status: JobStatus }
export type Step = 'wait' | 'handles' | 'progress' | 'review' | 'retry' | 'done';
export function resumeStep(creatorStatus: CreatorStatus | null, latestJob: JobSnapshot | null, _handlesCount: number): Step {
 if (creatorStatus === null) return 'wait';
 if (creatorStatus === 'active') return 'done';
 if (latestJob === null) return 'handles';
 switch (latestJob.status) {
  case 'queued': case 'fetching': case 'analyzing': return 'progress';
  case 'ready': return 'review';
  case 'failed': return 'retry';
 }
}
