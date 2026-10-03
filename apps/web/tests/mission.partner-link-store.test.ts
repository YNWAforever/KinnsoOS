import { expect, it, vi } from 'vitest'
import { createPartnerLinkStore } from '@/lib/missions/partner-link-store'

const builder = (result: unknown) => {
  const chain = {
    select: vi.fn(() => chain),
    eq: vi.fn(() => chain),
    maybeSingle: vi.fn(async () => result),
  }
  return chain
}

it('maps the owned participant query', async () => {
  const participantQuery = builder({
    data: { id: 'p1', mission_id: 'm1', creator_id: 'c1', status: 'active' },
    error: null,
  })
  const supabase = {
    from: vi.fn((table: string) => {
      if (table === 'mission_participants') return participantQuery
      throw new Error('unexpected table ' + table)
    }),
  }

  const store = createPartnerLinkStore(supabase as never)
  await expect(store.loadParticipant({
    missionParticipantId: 'p1',
    creatorId: 'c1',
  })).resolves.toEqual({
    data: { id: 'p1', missionId: 'm1', creatorId: 'c1', status: 'active' },
    error: null,
  })
  expect(participantQuery.eq).toHaveBeenNthCalledWith(1, 'id', 'p1')
  expect(participantQuery.eq).toHaveBeenNthCalledWith(2, 'creator_id', 'c1')
})

it('maps the mission query', async () => {
  const missionQuery = builder({
    data: {
      id: 'm1',
      affiliate_network_program_id: 'program-1',
      mission_source: 'travelpayouts',
      status: 'published',
    },
    error: null,
  })
  const supabase = {
    from: vi.fn((table: string) => {
      if (table === 'missions') return missionQuery
      throw new Error('unexpected table ' + table)
    }),
  }

  const store = createPartnerLinkStore(supabase as never)
  await expect(store.loadMission('m1')).resolves.toEqual({
    data: {
      id: 'm1',
      affiliateNetworkProgramId: 'program-1',
      missionSource: 'travelpayouts',
      status: 'published',
    },
    error: null,
  })
  expect(missionQuery.select).toHaveBeenCalledWith(
    'id, affiliate_network_program_id, mission_source, status',
  )
  expect(missionQuery.eq).toHaveBeenCalledWith('id', 'm1')
})

it('maps the affiliate program query', async () => {
  const programQuery = builder({
    data: { id: 'program-1', network: 'travelpayouts', status: 'active' },
    error: null,
  })
  const supabase = {
    from: vi.fn((table: string) => {
      if (table === 'affiliate_network_programs') return programQuery
      throw new Error('unexpected table ' + table)
    }),
  }

  const store = createPartnerLinkStore(supabase as never)
  await expect(store.loadProgram('program-1')).resolves.toEqual({
    data: { id: 'program-1', network: 'travelpayouts', status: 'active' },
    error: null,
  })
  expect(programQuery.select).toHaveBeenCalledWith('id, network, status')
  expect(programQuery.eq).toHaveBeenCalledWith('id', 'program-1')
})

it('propagates query errors without a mapped record', async () => {
  const error = new Error('mission lookup failed')
  const missionQuery = builder({ data: null, error })
  const supabase = {
    from: vi.fn((table: string) => {
      if (table === 'missions') return missionQuery
      throw new Error('unexpected table ' + table)
    }),
  }

  const store = createPartnerLinkStore(supabase as never)
  await expect(store.loadMission('m1')).resolves.toEqual({ data: null, error })
})

it('uses the complete successful-link identity', async () => {
  const linkQuery = builder({
    data: { id: 'link-1', partner_url: 'https://tp.st/existing' },
    error: null,
  })
  const supabase = {
    from: vi.fn((table: string) => {
      if (table === 'affiliate_partner_links') return linkQuery
      throw new Error('unexpected table ' + table)
    }),
  }

  const store = createPartnerLinkStore(supabase as never)
  await expect(store.findSuccessfulLink({
    network: 'travelpayouts',
    missionId: 'm1',
    missionParticipantId: 'p1',
    creatorId: 'c1',
    originalUrl: 'https://example.com/hotel',
  })).resolves.toEqual({
    data: { id: 'link-1', partnerUrl: 'https://tp.st/existing' },
    error: null,
  })
  expect(linkQuery.eq).toHaveBeenCalledWith('network', 'travelpayouts')
  expect(linkQuery.eq).toHaveBeenCalledWith('mission_id', 'm1')
  expect(linkQuery.eq).toHaveBeenCalledWith('mission_participant_id', 'p1')
  expect(linkQuery.eq).toHaveBeenCalledWith('creator_id', 'c1')
  expect(linkQuery.eq).toHaveBeenCalledWith('original_url', 'https://example.com/hotel')
  expect(linkQuery.eq).toHaveBeenCalledWith('external_status', 'success')
})

it('saves through the existing RPC', async () => {
  const rpc = vi.fn(async () => ({
    data: [{ id: 'link-1', partner_url: 'https://tp.st/abc?sub_id=s1' }],
    error: null,
  }))
  const store = createPartnerLinkStore({ rpc } as never)

  await expect(store.savePartnerLink({
    affiliateNetworkProgramId: 'program-1',
    missionId: 'mission-1',
    missionParticipantId: 'participant-1',
    creatorId: 'creator-1',
    originalUrl: 'https://example.com/hotel',
    partnerUrl: 'https://tp.st/abc?sub_id=s1',
    subId: 's1',
  })).resolves.toEqual({
    data: { id: 'link-1', partnerUrl: 'https://tp.st/abc?sub_id=s1' },
    error: null,
  })
  expect(rpc).toHaveBeenCalledWith('create_travelpayouts_partner_link', {
    p_affiliate_network_program_id: 'program-1',
    p_mission_id: 'mission-1',
    p_mission_participant_id: 'participant-1',
    p_original_url: 'https://example.com/hotel',
    p_partner_url: 'https://tp.st/abc?sub_id=s1',
    p_sub_id: 's1',
  })
})

it('propagates RPC errors without a mapped record', async () => {
  const error = new Error('partner-link RPC failed')
  const rpc = vi.fn(async () => ({ data: null, error }))
  const store = createPartnerLinkStore({ rpc } as never)

  await expect(store.savePartnerLink({
    affiliateNetworkProgramId: 'program-1',
    missionId: 'mission-1',
    missionParticipantId: 'participant-1',
    creatorId: 'creator-1',
    originalUrl: 'https://example.com/hotel',
    partnerUrl: 'https://tp.st/abc?sub_id=s1',
    subId: 's1',
  })).resolves.toEqual({ data: null, error })
})
