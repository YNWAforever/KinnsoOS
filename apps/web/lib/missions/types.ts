import type { GatedTier } from '@/lib/contribution/tiers'

export const missionTypes = ['coupon_affiliate', 'hybrid', 'paid', 'receipt_cashback'] as const

export type MissionType = (typeof missionTypes)[number]

export const missionSources = ['merchant', 'travelpayouts'] as const

export type MissionSource = (typeof missionSources)[number]

export const missionVisibilities = ['open', 'targeted'] as const

export type MissionVisibility = (typeof missionVisibilities)[number]

export const missionEfforts = ['low', 'medium', 'high'] as const

export type MissionEffort = (typeof missionEfforts)[number]

export const missionStatuses = ['draft', 'published', 'paused', 'completed', 'cancelled'] as const

export type MissionStatus = (typeof missionStatuses)[number]

export const participantStatuses = ['invited', 'applied', 'rejected', 'active', 'completed', 'cancelled'] as const

export type ParticipantStatus = (typeof participantStatuses)[number]

export const participantSources = ['open_join', 'application', 'merchant_invite', 'affiliate_network_join'] as const

export type ParticipantSource = (typeof participantSources)[number]

export type ParticipantReviewAction = 'approve' | 'reject'

export const submissionStatuses = ['pending', 'submitted', 'revision_requested', 'approved', 'rejected'] as const

export type SubmissionStatus = (typeof submissionStatuses)[number]

export type SubmissionReviewAction = 'approve' | 'request_revision' | 'reject'

export const settlementStatuses = ['not_started', 'pending', 'partially_paid', 'paid', 'disputed'] as const

export type SettlementStatus = (typeof settlementStatuses)[number]

export const affiliateNetworks = ['travelpayouts'] as const

export type AffiliateNetwork = (typeof affiliateNetworks)[number]

export type AffiliateProgramStatus = 'active' | 'inactive' | 'paused'

export type SettlementPaymentStatus = 'pending' | 'paid'

export type ValidationErrors = Record<string, string[]>

export type ValidationResult = { ok: true; errors: Record<string, never> } | { ok: false; errors: ValidationErrors }

export type MissionMilestoneInput = {
  title: string
  description: string
}

export type MissionDraftInput = {
  missionSource: MissionSource
  missionType: MissionType
  visibility: MissionVisibility
  title: string
  summary: string
  couponCode: string | null
  couponUrl: string | null
  affiliateCommissionRate: number | null
  kinnsoCommissionRate: number | null
  creatorCommissionRate: number | null
  paidFeeAmount: number | null
  paidFeeCurrency: string | null
  affiliateNetworkProgramId: string | null
  minTier: GatedTier | null
  maxReceiptsPerCreator: number | null
  milestones: MissionMilestoneInput[]
  deliverables: string[]
  requirements: string[]
  dos: string[]
  donts: string[]
  keyMessages: string[]
  referenceLinks: string[]
  effort: MissionEffort | null
}

export type PartnerLinkRequest = {
  programStatus: AffiliateProgramStatus
  participantStatus: ParticipantStatus
  originalUrl: string
}
