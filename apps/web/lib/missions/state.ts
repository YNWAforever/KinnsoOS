import type {
  MissionSource,
  MissionType,
  ParticipantReviewAction,
  ParticipantSource,
  ParticipantStatus,
  SubmissionReviewAction,
  SubmissionStatus,
} from '@/lib/missions/types'

type JoinInput = {
  missionType: MissionType
  missionSource: MissionSource
}

type JoinResult = {
  source: ParticipantSource
  status: ParticipantStatus
}

export const nextJoinStatus = (input: JoinInput): JoinResult => {
  if (input.missionType === 'coupon_affiliate') {
    return {
      source: input.missionSource === 'travelpayouts' ? 'affiliate_network_join' : 'open_join',
      status: 'active',
    }
  }

  return {
    source: 'application',
    status: 'applied',
  }
}

export const reviewParticipant = (
  currentStatus: ParticipantStatus,
  action: ParticipantReviewAction,
): ParticipantStatus => {
  if (currentStatus !== 'applied' && currentStatus !== 'invited') {
    throw new Error(`Cannot review participant from ${currentStatus}`)
  }

  return action === 'approve' ? 'active' : 'rejected'
}

export const reviewSubmission = (
  currentStatus: SubmissionStatus,
  action: SubmissionReviewAction,
): SubmissionStatus => {
  if (currentStatus !== 'submitted') {
    throw new Error(`Cannot review submission from ${currentStatus}`)
  }

  if (action === 'approve') return 'approved'
  if (action === 'request_revision') return 'revision_requested'
  return 'rejected'
}
