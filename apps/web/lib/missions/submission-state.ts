import type { MilestoneState } from '@/lib/missions/detail'

const SUBMITTABLE_STATES: ReadonlySet<MilestoneState> = new Set(['none', 'submitted', 'revision_requested'])

export function canSubmitMilestone(participantStatus: string | null, state: MilestoneState): boolean {
  if (participantStatus !== 'active') return false
  return SUBMITTABLE_STATES.has(state)
}
