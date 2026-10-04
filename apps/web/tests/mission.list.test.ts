import { describe, expect, it } from 'vitest'
import { creatorMissionProgress, segmentMissions } from '@/lib/missions/list'

describe('creatorMissionProgress', () => {
  it('counts distinct milestones with a non-pending submission', () => {
    const milestones = [{ id: 'a' }, { id: 'b' }, { id: 'c' }]
    const submissions = [
      { status: 'submitted', mission_milestone_id: 'a' },
      { status: 'approved', mission_milestone_id: 'a' },
      { status: 'submitted', mission_milestone_id: 'b' },
    ]
    expect(creatorMissionProgress(milestones, submissions)).toEqual({ milestoneCount: 3, submittedCount: 2 })
  })

  it('excludes pending submissions and treats null inputs as empty', () => {
    expect(
      creatorMissionProgress([{ id: 'a' }], [{ status: 'pending', mission_milestone_id: 'a' }]),
    ).toEqual({ milestoneCount: 1, submittedCount: 0 })
    expect(creatorMissionProgress(null, null)).toEqual({ milestoneCount: 0, submittedCount: 0 })
  })

  it('ignores submissions for milestones not in the mission', () => {
    expect(
      creatorMissionProgress([{ id: 'a' }], [{ status: 'submitted', mission_milestone_id: 'ghost' }]),
    ).toEqual({ milestoneCount: 1, submittedCount: 0 })
  })
})

describe('segmentMissions', () => {
  it('splits by participation and preserves order', () => {
    const m = [
      { id: '1', participant: null },
      { id: '2', participant: { id: 'p2', status: 'active' } },
      { id: '3', participant: null },
    ]
    const { mine, available } = segmentMissions(m)
    expect(mine.map((x) => x.id)).toEqual(['2'])
    expect(available.map((x) => x.id)).toEqual(['1', '3'])
  })
})
