import { describe, expect, it, vi } from 'vitest'
import {
  createPartnerLinkCommand,
  type PartnerLinkProvider,
  type PartnerLinkStore,
} from '@/lib/missions/partner-link-command'

const actor = { id: 'creator-1' }
const input = {
  missionParticipantId: 'participant-1',
  originalUrl: 'https://example.com/hotel',
}
const participant = {
  id: 'participant-1',
  missionId: 'mission-1',
  creatorId: 'creator-1',
  status: 'active' as const,
}
const mission = {
  id: 'mission-1',
  affiliateNetworkProgramId: 'program-1',
  missionSource: 'travelpayouts',
  status: 'published',
}
const program = {
  id: 'program-1',
  network: 'travelpayouts',
  status: 'active' as const,
}
const savedLink = {
  id: 'link-1',
  partnerUrl: 'https://tp.st/abc?sub_id=creator-sub',
}

function makeStore(overrides: Partial<PartnerLinkStore> = {}): PartnerLinkStore {
  return {
    loadParticipant: vi.fn(async () => ({ data: participant, error: null })),
    loadMission: vi.fn(async () => ({ data: mission, error: null })),
    loadProgram: vi.fn(async () => ({ data: program, error: null })),
    findSuccessfulLink: vi.fn(async () => ({ data: null, error: null })),
    savePartnerLink: vi.fn(async () => ({ data: savedLink, error: null })),
    ...overrides,
  }
}

function makeProvider(overrides: Partial<PartnerLinkProvider> = {}): PartnerLinkProvider {
  return {
    buildSubId: vi.fn(() => 'creator-sub'),
    create: vi.fn(async () => ({
      ok: true as const,
      partnerUrl: savedLink.partnerUrl,
    })),
    ...overrides,
  }
}

describe('createPartnerLinkCommand', () => {
  it('stops at a missing participant', async () => {
    const provider = makeProvider()
    const result = await createPartnerLinkCommand(actor, input, {
      store: makeStore({
        loadParticipant: vi.fn(async () => ({ data: null, error: null })),
      }),
      provider,
    })

    expect(result).toEqual({ kind: 'failed', code: 'participant-not-found' })
    expect(provider.create).not.toHaveBeenCalled()
  })

  it('classifies an unavailable mission before downstream work', async () => {
    const store = makeStore({
      loadMission: vi.fn(async () => ({
        data: { ...mission, status: 'draft' },
        error: null,
      })),
    })
    const provider = makeProvider()
    const result = await createPartnerLinkCommand(actor, input, { store, provider })

    expect(result).toEqual({ kind: 'failed', code: 'mission-unavailable' })
    expect(store.loadProgram).not.toHaveBeenCalled()
    expect(store.findSuccessfulLink).not.toHaveBeenCalled()
    expect(store.savePartnerLink).not.toHaveBeenCalled()
    expect(provider.buildSubId).not.toHaveBeenCalled()
    expect(provider.create).not.toHaveBeenCalled()
  })

  it('classifies an unavailable program before provider or persistence work', async () => {
    const store = makeStore({
      loadProgram: vi.fn(async () => ({
        data: { ...program, network: 'impact' },
        error: null,
      })),
    })
    const provider = makeProvider()
    const result = await createPartnerLinkCommand(actor, input, { store, provider })

    expect(result).toEqual({ kind: 'failed', code: 'program-unavailable' })
    expect(store.findSuccessfulLink).not.toHaveBeenCalled()
    expect(store.savePartnerLink).not.toHaveBeenCalled()
    expect(provider.buildSubId).not.toHaveBeenCalled()
    expect(provider.create).not.toHaveBeenCalled()
  })

  it('classifies a partner-link load error before provider or persistence work', async () => {
    const store = makeStore({
      findSuccessfulLink: vi.fn(async () => ({
        data: null,
        error: new Error('lookup failed'),
      })),
    })
    const provider = makeProvider()
    const result = await createPartnerLinkCommand(actor, input, { store, provider })

    expect(result).toEqual({ kind: 'failed', code: 'partner-link-load-failed' })
    expect(store.savePartnerLink).not.toHaveBeenCalled()
    expect(provider.buildSubId).not.toHaveBeenCalled()
    expect(provider.create).not.toHaveBeenCalled()
  })

  it('returns validation errors before idempotency lookup', async () => {
    const store = makeStore({
      loadParticipant: vi.fn(async () => ({
        data: { ...participant, status: 'applied' as const },
        error: null,
      })),
    })
    const result = await createPartnerLinkCommand(actor, input, {
      store,
      provider: makeProvider(),
    })

    expect(result).toEqual({
      kind: 'validation-failed',
      errors: { participantStatus: ['active'] },
    })
    expect(store.findSuccessfulLink).not.toHaveBeenCalled()
  })

  it('reuses a successful link without provider work', async () => {
    const provider = makeProvider()
    const result = await createPartnerLinkCommand(actor, input, {
      store: makeStore({
        findSuccessfulLink: vi.fn(async () => ({
          data: savedLink,
          error: null,
        })),
      }),
      provider,
    })

    expect(result).toEqual({ kind: 'reused', link: savedLink })
    expect(provider.buildSubId).not.toHaveBeenCalled()
    expect(provider.create).not.toHaveBeenCalled()
  })

  it('passes the SubID to the provider and exact save input', async () => {
    const store = makeStore()
    const provider = makeProvider()
    const result = await createPartnerLinkCommand(actor, input, { store, provider })

    expect(result).toEqual({ kind: 'created', link: savedLink })
    expect(provider.buildSubId).toHaveBeenCalledWith({
      missionId: 'mission-1',
      participantId: 'participant-1',
      creatorId: 'creator-1',
    })
    expect(provider.create).toHaveBeenCalledWith({
      originalUrl: input.originalUrl,
      subId: 'creator-sub',
    })
    expect(store.savePartnerLink).toHaveBeenCalledWith({
      affiliateNetworkProgramId: 'program-1',
      missionId: 'mission-1',
      missionParticipantId: 'participant-1',
      creatorId: 'creator-1',
      originalUrl: input.originalUrl,
      partnerUrl: savedLink.partnerUrl,
      subId: 'creator-sub',
    })
  })

  it('does not persist after provider failure', async () => {
    const store = makeStore()
    const result = await createPartnerLinkCommand(actor, input, {
      store,
      provider: makeProvider({
        create: vi.fn(async () => ({
          ok: false as const,
          reason: 'Unsupported link',
        })),
      }),
    })

    expect(result).toEqual({
      kind: 'failed',
      code: 'provider-failed',
      reason: 'Unsupported link',
    })
    expect(store.savePartnerLink).not.toHaveBeenCalled()
  })

  it('classifies a thrown provider dependency with its reason', async () => {
    const store = makeStore()
    const provider = makeProvider({
      create: vi.fn(async () => {
        throw new Error('Travelpayouts timeout')
      }),
    })
    const result = await createPartnerLinkCommand(actor, input, { store, provider })

    expect(result).toEqual({
      kind: 'failed',
      code: 'provider-failed',
      reason: 'Travelpayouts timeout',
    })
    expect(store.savePartnerLink).not.toHaveBeenCalled()
  })

  it('classifies a persistence failure after provider success', async () => {
    const result = await createPartnerLinkCommand(actor, input, {
      store: makeStore({
        savePartnerLink: vi.fn(async () => ({
          data: null,
          error: new Error('rpc denied'),
        })),
      }),
      provider: makeProvider(),
    })

    expect(result).toEqual({ kind: 'failed', code: 'persistence-failed' })
  })
})
