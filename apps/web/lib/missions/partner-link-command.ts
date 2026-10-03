import { validatePartnerLinkRequest } from './validation'
import type {
  AffiliateProgramStatus,
  ParticipantStatus,
  ValidationErrors,
} from './types'

export type PartnerLinkActor = { id: string }

export type PartnerLinkCommandInput = {
  missionParticipantId: string
  originalUrl: string
}

export type StoreResult<T> = {
  data: T | null
  error: unknown | null
}

export type ParticipantContext = {
  id: string
  missionId: string
  creatorId: string
  status: ParticipantStatus
}

export type MissionContext = {
  id: string
  affiliateNetworkProgramId: string | null
  missionSource: string | null
  status: string | null
}

export type ProgramContext = {
  id: string
  network: string
  status: AffiliateProgramStatus
}

export type PartnerLinkRecord = {
  id: string
  partnerUrl: string
}

export type SavePartnerLinkInput = {
  affiliateNetworkProgramId: string
  missionId: string
  missionParticipantId: string
  creatorId: string
  originalUrl: string
  partnerUrl: string
  subId: string
}

export type ExistingPartnerLinkLookup = {
  network: 'travelpayouts'
  missionId: string
  missionParticipantId: string
  creatorId: string
  originalUrl: string
}

export type BuildSubIdInput = {
  missionId: string
  participantId: string
  creatorId: string
}

export type PartnerLinkProviderResult =
  | { ok: true; partnerUrl: string }
  | { ok: false; reason: string }

export type PartnerLinkProvider = {
  buildSubId(input: BuildSubIdInput): string
  create(input: {
    originalUrl: string
    subId: string
  }): Promise<PartnerLinkProviderResult>
}

export type PartnerLinkStore = {
  loadParticipant(input: {
    missionParticipantId: string
    creatorId: string
  }): Promise<StoreResult<ParticipantContext>>
  loadMission(missionId: string): Promise<StoreResult<MissionContext>>
  loadProgram(programId: string): Promise<StoreResult<ProgramContext>>
  findSuccessfulLink(
    input: ExistingPartnerLinkLookup,
  ): Promise<StoreResult<PartnerLinkRecord>>
  savePartnerLink(input: SavePartnerLinkInput): Promise<StoreResult<PartnerLinkRecord>>
}

export type PartnerLinkCommandResult =
  | { kind: 'created'; link: PartnerLinkRecord }
  | { kind: 'reused'; link: PartnerLinkRecord }
  | { kind: 'validation-failed'; errors: ValidationErrors }
  | {
      kind: 'failed'
      code:
        | 'participant-not-found'
        | 'mission-unavailable'
        | 'program-unavailable'
        | 'partner-link-load-failed'
        | 'provider-failed'
        | 'persistence-failed'
      reason?: string
    }

export async function createPartnerLinkCommand(
  actor: PartnerLinkActor,
  input: PartnerLinkCommandInput,
  deps: {
    store: PartnerLinkStore
    provider: PartnerLinkProvider
  },
): Promise<PartnerLinkCommandResult> {
  const participantResult = await deps.store.loadParticipant({
    missionParticipantId: input.missionParticipantId,
    creatorId: actor.id,
  })
  const participant = participantResult.data
  if (
    participantResult.error
    || !participant
    || participant.creatorId !== actor.id
  ) {
    return { kind: 'failed', code: 'participant-not-found' }
  }

  const missionResult = await deps.store.loadMission(participant.missionId)
  const mission = missionResult.data
  if (
    missionResult.error
    || !mission
    || mission.status !== 'published'
    || mission.missionSource !== 'travelpayouts'
    || !mission.affiliateNetworkProgramId
  ) {
    return { kind: 'failed', code: 'mission-unavailable' }
  }

  const programResult = await deps.store.loadProgram(mission.affiliateNetworkProgramId)
  const program = programResult.data
  if (
    programResult.error
    || !program
    || program.network !== 'travelpayouts'
  ) {
    return { kind: 'failed', code: 'program-unavailable' }
  }

  const validation = validatePartnerLinkRequest({
    programStatus: program.status,
    participantStatus: participant.status,
    originalUrl: input.originalUrl,
  })
  if (!validation.ok) {
    return { kind: 'validation-failed', errors: validation.errors }
  }

  const existingResult = await deps.store.findSuccessfulLink({
    network: 'travelpayouts',
    missionId: mission.id,
    missionParticipantId: participant.id,
    creatorId: actor.id,
    originalUrl: input.originalUrl,
  })
  if (existingResult.error) {
    return { kind: 'failed', code: 'partner-link-load-failed' }
  }
  if (existingResult.data) {
    return { kind: 'reused', link: existingResult.data }
  }

  const subId = deps.provider.buildSubId({
    missionId: mission.id,
    participantId: participant.id,
    creatorId: actor.id,
  })

  let providerResult: PartnerLinkProviderResult
  try {
    providerResult = await deps.provider.create({
      originalUrl: input.originalUrl,
      subId,
    })
  } catch (error) {
    return {
      kind: 'failed',
      code: 'provider-failed',
      reason: error instanceof Error ? error.message : String(error),
    }
  }

  if (!providerResult.ok) {
    return {
      kind: 'failed',
      code: 'provider-failed',
      reason: providerResult.reason,
    }
  }

  const savedResult = await deps.store.savePartnerLink({
    affiliateNetworkProgramId: mission.affiliateNetworkProgramId,
    missionId: mission.id,
    missionParticipantId: participant.id,
    creatorId: actor.id,
    originalUrl: input.originalUrl,
    partnerUrl: providerResult.partnerUrl,
    subId,
  })
  if (savedResult.error || !savedResult.data) {
    return { kind: 'failed', code: 'persistence-failed' }
  }

  return { kind: 'created', link: savedResult.data }
}
