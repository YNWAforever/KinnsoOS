export type MilestoneRef = { id: string }
export type SubmissionRef = { status: string | null; mission_milestone_id: string }

export function creatorMissionProgress(
  milestones: MilestoneRef[] | null | undefined,
  submissions: SubmissionRef[] | null | undefined,
): { milestoneCount: number; submittedCount: number } {
  const milestoneCount = milestones?.length ?? 0
  const ids = new Set((milestones ?? []).map((m) => m.id))
  const submittedMilestones = new Set(
    (submissions ?? [])
      .filter((s) => s.status !== 'pending')
      .filter((s) => ids.has(s.mission_milestone_id))
      .map((s) => s.mission_milestone_id),
  )
  return { milestoneCount, submittedCount: Math.min(submittedMilestones.size, milestoneCount) }
}

export function segmentMissions<T extends { participant: { id: string; status: string } | null }>(
  missions: T[],
): { mine: T[]; available: T[] } {
  const mine: T[] = []
  const available: T[] = []
  for (const mission of missions) {
    if (mission.participant) mine.push(mission)
    else available.push(mission)
  }
  return { mine, available }
}
