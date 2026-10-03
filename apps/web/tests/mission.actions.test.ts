import { readFileSync } from 'node:fs'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { missionDraftFixture } from './fixtures/missionDraft'
import {
  buildMissionInsert,
  buildParticipantInsert,
  createMissionAction,
  createPartnerLinkAction,
  joinMissionAction,
  reviewParticipantAction,
  reviewSubmissionAction,
  submitMilestoneAction,
} from '@/lib/missions/actions'

const {
  createPartnerLinkCommandMock,
  createPartnerLinkStoreMock,
  createSupabaseServerClientMock,
  createTravelpayoutsPartnerLinkProviderMock,
  revalidatePathMock,
} = vi.hoisted(() => ({
  createPartnerLinkCommandMock: vi.fn(),
  createPartnerLinkStoreMock: vi.fn(),
  createSupabaseServerClientMock: vi.fn(),
  createTravelpayoutsPartnerLinkProviderMock: vi.fn(),
  revalidatePathMock: vi.fn(),
}))

vi.mock('@/lib/supabase/server', () => ({
  createSupabaseServerClient: createSupabaseServerClientMock,
}))

vi.mock('next/cache', () => ({
  revalidatePath: revalidatePathMock,
}))

vi.mock('@/lib/missions/partner-link-command', () => ({
  createPartnerLinkCommand: createPartnerLinkCommandMock,
}))

vi.mock('@/lib/missions/partner-link-store', () => ({
  createPartnerLinkStore: createPartnerLinkStoreMock,
}))

vi.mock('@/lib/missions/partner-link-provider', () => ({
  createTravelpayoutsPartnerLinkProvider:
    createTravelpayoutsPartnerLinkProviderMock,
}))

vi.mock('server-only', () => ({}))

type MockBuilder = {
  delete: ReturnType<typeof vi.fn>
  eq: ReturnType<typeof vi.fn>
  insert: ReturnType<typeof vi.fn>
  maybeSingle: ReturnType<typeof vi.fn>
  order: ReturnType<typeof vi.fn>
  or: ReturnType<typeof vi.fn>
  select: ReturnType<typeof vi.fn>
  single: ReturnType<typeof vi.fn>
  update: ReturnType<typeof vi.fn>
}

const createBuilder = (overrides: Partial<MockBuilder> = {}) => {
  const builder = {} as MockBuilder
  builder.delete = vi.fn(() => builder)
  builder.eq = vi.fn(() => builder)
  builder.insert = vi.fn(() => builder)
  builder.maybeSingle = vi.fn(() => builder)
  builder.order = vi.fn(() => builder)
  builder.or = vi.fn(() => builder)
  builder.select = vi.fn(() => builder)
  builder.single = vi.fn(() => builder)
  builder.update = vi.fn(() => builder)
  return Object.assign(builder, overrides)
}

const createSupabaseMock = (
  tableBuilders: Record<string, MockBuilder | MockBuilder[]>,
  options: {
    getUser?: ReturnType<typeof vi.fn>
    rpc?: ReturnType<typeof vi.fn>
  } = {},
) => {
  const builders = new Map(
    Object.entries(tableBuilders).map(([table, builder]) => [
      table,
      Array.isArray(builder) ? [...builder] : builder,
    ]),
  )

  return {
    auth: {
      getUser: options.getUser ?? vi.fn(async () => ({ data: { user: { id: 'user-1' } }, error: null })),
    },
    from: vi.fn((table: string) => {
      const builder = builders.get(table)
      if (!builder) throw new Error(`Unexpected table: ${table}`)

      if (Array.isArray(builder)) {
        const next = builder.shift()
        if (!next) throw new Error(`Unexpected repeated table: ${table}`)
        return next
      }

      return builder
    }),
    rpc: options.rpc ?? vi.fn(async () => ({ data: null, error: null })),
  }
}

beforeEach(() => {
  createPartnerLinkCommandMock.mockReset()
  createPartnerLinkStoreMock.mockReset()
  createSupabaseServerClientMock.mockReset()
  createTravelpayoutsPartnerLinkProviderMock.mockReset()
  revalidatePathMock.mockReset()
})

afterEach(() => {
  vi.unstubAllEnvs()
})

describe('mission actions module boundary', () => {
  it('keeps synchronous builders out of a file-level server module', () => {
    const source = readFileSync(new URL('../lib/missions/actions.ts', import.meta.url), 'utf8')

    expect(source.trimStart().startsWith("'use server'")).toBe(false)
    expect(source).not.toContain("from 'next/cache'")
    expect(source).not.toContain('from "next/cache"')
    expect(source).not.toContain('createSupabaseServiceClient')
    expect(source).not.toContain('SUPABASE_SERVICE_ROLE_KEY')
    expect(buildMissionInsert({
      input: missionDraftFixture,
      merchantProfileId: 'merchant-profile-1',
      opsMemberId: null,
      publish: false,
    })).not.toHaveProperty('then')
  })
})

describe('mission actions builders', () => {
  it('builds a mission insert payload from a valid merchant draft', () => {
    const payload = buildMissionInsert({
      input: missionDraftFixture,
      merchantProfileId: 'merchant-profile-1',
      opsMemberId: null,
      publish: true,
    })
    expect(payload).toMatchObject({
      merchant_profile_id: 'merchant-profile-1',
      mission_source: 'merchant',
      mission_type: 'coupon_affiliate',
      status: 'published',
      coupon_code: 'STAY10',
    })
    expect(payload.published_at).toEqual(expect.any(String))
  })

  it('carries the brief richness fields into the mission insert payload', () => {
    const payload = buildMissionInsert({
      input: {
        ...missionDraftFixture,
        deliverables: ['Instagram Reel', 'Blog post'],
        requirements: ['Tag @merchant'],
        dos: ['Show the storefront'],
        donts: ['Do not disparage competitors'],
        keyMessages: ['Family-friendly staycation'],
        referenceLinks: ['https://merchant.test/brand-guide'],
        effort: 'medium',
      },
      merchantProfileId: 'merchant-profile-1',
      opsMemberId: null,
      publish: false,
    })
    expect(payload).toMatchObject({
      deliverables: ['Instagram Reel', 'Blog post'],
      requirements: ['Tag @merchant'],
      dos: ['Show the storefront'],
      donts: ['Do not disparage competitors'],
      key_messages: ['Family-friendly staycation'],
      reference_links: ['https://merchant.test/brand-guide'],
      effort: 'medium',
    })
  })

  it('carries empty brief richness arrays and a null effort through unchanged', () => {
    const payload = buildMissionInsert({
      input: missionDraftFixture,
      merchantProfileId: 'merchant-profile-1',
      opsMemberId: null,
      publish: false,
    })
    expect(payload).toMatchObject({
      deliverables: [],
      requirements: [],
      dos: [],
      donts: [],
      key_messages: [],
      reference_links: [],
      effort: null,
    })
  })

  it('builds an active participant for coupon auto-join', () => {
    expect(buildParticipantInsert({
      missionId: 'mission-1',
      creatorId: 'creator-1',
      missionType: 'coupon_affiliate',
      missionSource: 'merchant',
    })).toMatchObject({
      mission_id: 'mission-1',
      creator_id: 'creator-1',
      status: 'active',
      source: 'open_join',
    })
  })

  it('does not import next/cache at module evaluation in tests', async () => {
    vi.resetModules()
    await expect(import('@/lib/missions/actions')).resolves.toBeTruthy()
  })

  it('carries min_tier into the mission insert payload', () => {
    const payload = buildMissionInsert({
      input: { ...missionDraftFixture, minTier: 'pro' },
      merchantProfileId: 'merchant-profile-1',
      opsMemberId: null,
      publish: true,
    })
    expect(payload.min_tier).toBe('pro')
  })

  it('defaults min_tier to null when the draft is open to all', () => {
    const payload = buildMissionInsert({
      input: { ...missionDraftFixture, minTier: null },
      merchantProfileId: 'merchant-profile-1',
      opsMemberId: null,
      publish: false,
    })
    expect(payload.min_tier).toBeNull()
  })

  it('builds a receipt_cashback mission insert payload with the per-receipt fee and cap', () => {
    const payload = buildMissionInsert({
      input: {
        ...missionDraftFixture,
        missionType: 'receipt_cashback',
        couponCode: null,
        couponUrl: null,
        affiliateCommissionRate: null,
        kinnsoCommissionRate: null,
        creatorCommissionRate: null,
        paidFeeAmount: 50,
        paidFeeCurrency: 'HKD',
        maxReceiptsPerCreator: 3,
        milestones: [],
      },
      merchantProfileId: 'merchant-profile-1',
      opsMemberId: null,
      publish: true,
    })
    expect(payload).toMatchObject({
      mission_type: 'receipt_cashback',
      paid_fee_amount: 50,
      paid_fee_currency: 'HKD',
      max_receipts_per_creator: 3,
    })
  })

  it('defaults max_receipts_per_creator to null when the draft leaves it unset', () => {
    const payload = buildMissionInsert({
      input: { ...missionDraftFixture, maxReceiptsPerCreator: null },
      merchantProfileId: 'merchant-profile-1',
      opsMemberId: null,
      publish: false,
    })
    expect(payload.max_receipts_per_creator).toBeNull()
  })
})

describe('createMissionAction', () => {
  it('revalidates locale-aware merchant and studio mission paths', async () => {
    const supabase = createSupabaseMock({
      merchant_profiles: createBuilder({
        maybeSingle: vi.fn(async () => ({ data: { id: 'merchant-profile-1' }, error: null })),
      }),
      missions: createBuilder({
        single: vi.fn(async () => ({ data: { id: 'mission-1' }, error: null })),
      }),
      mission_milestones: createBuilder({
        insert: vi.fn(async () => ({ error: null })),
      }),
    })
    createSupabaseServerClientMock.mockResolvedValue(supabase)

    const result = await createMissionAction(missionDraftFixture, {
      publish: true,
      locale: 'zh-hk',
    })

    expect(result).toEqual({ ok: true, missionId: 'mission-1' })
    expect(revalidatePathMock).toHaveBeenCalledWith('/zh-hk/merchants/dashboard/missions')
    expect(revalidatePathMock).toHaveBeenCalledWith('/zh-hk/studio/missions')
  })

  it('rolls back the mission when milestone insertion fails', async () => {
    const missionDeleteBuilder = createBuilder({
      maybeSingle: vi.fn(async () => ({ data: { id: 'mission-1' }, error: null })),
    })
    const supabase = createSupabaseMock({
      merchant_profiles: createBuilder({
        maybeSingle: vi.fn(async () => ({ data: { id: 'merchant-profile-1' }, error: null })),
      }),
      missions: [
        createBuilder({
          single: vi.fn(async () => ({ data: { id: 'mission-1' }, error: null })),
        }),
        missionDeleteBuilder,
      ],
      mission_milestones: createBuilder({
        insert: vi.fn(async () => ({ error: new Error('milestone insert failed') })),
      }),
    })
    createSupabaseServerClientMock.mockResolvedValue(supabase)

    const result = await createMissionAction(missionDraftFixture, {
      publish: true,
      locale: 'zh-hk',
    })

    expect(result).toEqual({
      ok: false,
      errors: { form: ['Mission milestones could not be created'] },
    })
    expect(missionDeleteBuilder.delete).toHaveBeenCalledTimes(1)
    expect(missionDeleteBuilder.eq).toHaveBeenCalledWith('id', 'mission-1')
  })

  it('returns an incomplete creation error when rollback delete returns no row', async () => {
    const missionDeleteBuilder = createBuilder({
      maybeSingle: vi.fn(async () => ({ data: null, error: null })),
    })
    const supabase = createSupabaseMock({
      merchant_profiles: createBuilder({
        maybeSingle: vi.fn(async () => ({ data: { id: 'merchant-profile-1' }, error: null })),
      }),
      missions: [
        createBuilder({
          single: vi.fn(async () => ({ data: { id: 'mission-1' }, error: null })),
        }),
        missionDeleteBuilder,
      ],
      mission_milestones: createBuilder({
        insert: vi.fn(async () => ({ error: new Error('milestone insert failed') })),
      }),
    })
    createSupabaseServerClientMock.mockResolvedValue(supabase)

    const result = await createMissionAction(missionDraftFixture, {
      publish: true,
      locale: 'zh-hk',
    })

    expect(result).toEqual({
      ok: false,
      errors: {
        form: ['Mission creation is incomplete. Please retry or contact ops before publishing again.'],
      },
    })
    expect(missionDeleteBuilder.delete).toHaveBeenCalledTimes(1)
    expect(revalidatePathMock).not.toHaveBeenCalled()
  })
})

describe('reviewParticipantAction', () => {
  it('returns an error when the participant update returns no row', async () => {
    const participantUpdateBuilder = createBuilder({
      maybeSingle: vi.fn(async () => ({ data: null, error: null })),
    })
    const supabase = createSupabaseMock({
      merchant_profiles: createBuilder({
        maybeSingle: vi.fn(async () => ({ data: { id: 'merchant-profile-1' }, error: null })),
      }),
      mission_participants: [
        createBuilder({
          single: vi.fn(async () => ({
            data: { id: 'participant-1', mission_id: 'mission-1', status: 'applied' },
            error: null,
          })),
        }),
        participantUpdateBuilder,
      ],
      missions: createBuilder({
        maybeSingle: vi.fn(async () => ({ data: { id: 'mission-1' }, error: null })),
      }),
    })
    createSupabaseServerClientMock.mockResolvedValue(supabase)

    const result = await reviewParticipantAction({
      participantId: 'participant-1',
      action: 'approve',
      locale: 'zh-hk',
    })

    expect(result).toEqual({
      ok: false,
      errors: { form: ['Participant review could not be saved'] },
    })
    expect(participantUpdateBuilder.eq).toHaveBeenCalledWith('status', 'applied')
    expect(revalidatePathMock).not.toHaveBeenCalled()
  })
})

describe('joinMissionAction', () => {
  it('rejects merchant users before inserting a creator participant', async () => {
    const participantInsertBuilder = createBuilder({
      single: vi.fn(async () => ({ data: { id: 'participant-1' }, error: null })),
    })
    const supabase = createSupabaseMock({
      kinnso_ops_members: createBuilder({
        maybeSingle: vi.fn(async () => ({ data: null, error: null })),
      }),
      merchant_profiles: createBuilder({
        maybeSingle: vi.fn(async () => ({ data: { id: 'merchant-profile-1' }, error: null })),
      }),
      missions: createBuilder({
        single: vi.fn(async () => ({
          data: { id: 'mission-1', mission_type: 'coupon_affiliate', mission_source: 'merchant' },
          error: null,
        })),
      }),
      mission_participants: participantInsertBuilder,
    })
    createSupabaseServerClientMock.mockResolvedValue(supabase)

    const result = await joinMissionAction({ missionId: 'mission-1', locale: 'en' })

    expect(result).toEqual({
      ok: false,
      errors: { form: ['Creator access is required'] },
    })
    expect(participantInsertBuilder.insert).not.toHaveBeenCalled()
    expect(revalidatePathMock).not.toHaveBeenCalled()
  })
})

describe('joinMissionAction tier gate', () => {
  it('rejects a creator below the mission minimum tier', async () => {
    const supabase = createSupabaseMock({
      kinnso_ops_members: createBuilder({ maybeSingle: vi.fn(async () => ({ data: null, error: null })) }),
      merchant_profiles: createBuilder({ maybeSingle: vi.fn(async () => ({ data: null, error: null })) }),
      missions: createBuilder({
        single: vi.fn(async () => ({
          data: { id: 'mission-1', mission_type: 'hybrid', mission_source: 'merchant', min_tier: 'pro' },
          error: null,
        })),
      }),
      creator_contribution: createBuilder({ maybeSingle: vi.fn(async () => ({ data: { tier: 'rising' }, error: null })) }),
    })
    createSupabaseServerClientMock.mockResolvedValue(supabase)

    const result = await joinMissionAction({ missionId: 'mission-1', locale: 'en' })

    expect(result.ok).toBe(false)
  })

  it('allows a creator at or above the mission minimum tier', async () => {
    const supabase = createSupabaseMock({
      kinnso_ops_members: createBuilder({ maybeSingle: vi.fn(async () => ({ data: null, error: null })) }),
      merchant_profiles: createBuilder({ maybeSingle: vi.fn(async () => ({ data: null, error: null })) }),
      missions: createBuilder({
        single: vi.fn(async () => ({
          data: { id: 'mission-1', mission_type: 'hybrid', mission_source: 'merchant', min_tier: 'pro' },
          error: null,
        })),
      }),
      creator_contribution: createBuilder({ maybeSingle: vi.fn(async () => ({ data: { tier: 'elite' }, error: null })) }),
      mission_participants: createBuilder({ single: vi.fn(async () => ({ data: { id: 'participant-1' }, error: null })) }),
    })
    createSupabaseServerClientMock.mockResolvedValue(supabase)

    const result = await joinMissionAction({ missionId: 'mission-1', locale: 'en' })

    expect(result).toEqual({ ok: true, participantId: 'participant-1' })
  })

  it('allows joining an open (null min_tier) mission without reading tier', async () => {
    const supabase = createSupabaseMock({
      kinnso_ops_members: createBuilder({ maybeSingle: vi.fn(async () => ({ data: null, error: null })) }),
      merchant_profiles: createBuilder({ maybeSingle: vi.fn(async () => ({ data: null, error: null })) }),
      missions: createBuilder({
        single: vi.fn(async () => ({
          data: { id: 'mission-2', mission_type: 'coupon_affiliate', mission_source: 'merchant', min_tier: null },
          error: null,
        })),
      }),
      mission_participants: createBuilder({ single: vi.fn(async () => ({ data: { id: 'participant-2' }, error: null })) }),
    })
    createSupabaseServerClientMock.mockResolvedValue(supabase)

    const result = await joinMissionAction({ missionId: 'mission-2', locale: 'en' })

    expect(result).toEqual({ ok: true, participantId: 'participant-2' })
  })
})

describe('reviewSubmissionAction', () => {
  it('returns an error when the submission update returns no row', async () => {
    const submissionUpdateBuilder = createBuilder({
      maybeSingle: vi.fn(async () => ({ data: null, error: null })),
    })
    const supabase = createSupabaseMock({
      merchant_profiles: createBuilder({
        maybeSingle: vi.fn(async () => ({ data: { id: 'merchant-profile-1' }, error: null })),
      }),
      mission_milestone_submissions: [
        createBuilder({
          single: vi.fn(async () => ({
            data: {
              id: 'submission-1',
              status: 'submitted',
              mission_participant_id: 'participant-1',
            },
            error: null,
          })),
        }),
        submissionUpdateBuilder,
      ],
      mission_participants: createBuilder({
        single: vi.fn(async () => ({ data: { mission_id: 'mission-1' }, error: null })),
      }),
      missions: createBuilder({
        maybeSingle: vi.fn(async () => ({ data: { id: 'mission-1' }, error: null })),
      }),
    })
    createSupabaseServerClientMock.mockResolvedValue(supabase)

    const result = await reviewSubmissionAction({
      submissionId: 'submission-1',
      action: 'approve',
      locale: 'zh-hk',
    })

    expect(result).toEqual({
      ok: false,
      errors: { form: ['Submission review could not be saved'] },
    })
    expect(submissionUpdateBuilder.eq).toHaveBeenCalledWith('status', 'submitted')
    expect(revalidatePathMock).not.toHaveBeenCalled()
  })

  it('surfaces the budget-gate insufficient_budget abort as actionable copy', async () => {
    const submissionUpdateBuilder = createBuilder({
      maybeSingle: vi.fn(async () => ({
        data: null,
        error: { message: 'update failed: insufficient_budget' },
      })),
    })
    const supabase = createSupabaseMock({
      merchant_profiles: createBuilder({
        maybeSingle: vi.fn(async () => ({ data: { id: 'merchant-profile-1' }, error: null })),
      }),
      mission_milestone_submissions: [
        createBuilder({
          single: vi.fn(async () => ({
            data: {
              id: 'submission-1',
              status: 'submitted',
              mission_participant_id: 'participant-1',
            },
            error: null,
          })),
        }),
        submissionUpdateBuilder,
      ],
      mission_participants: createBuilder({
        single: vi.fn(async () => ({ data: { mission_id: 'mission-1' }, error: null })),
      }),
      missions: createBuilder({
        maybeSingle: vi.fn(async () => ({ data: { id: 'mission-1' }, error: null })),
      }),
    })
    createSupabaseServerClientMock.mockResolvedValue(supabase)

    const result = await reviewSubmissionAction({
      submissionId: 'submission-1',
      action: 'approve',
      locale: 'en',
    })

    expect(result).toEqual({
      ok: false,
      errors: { form: ['This approval needs more budget — top up before approving.'] },
    })
    expect(revalidatePathMock).not.toHaveBeenCalled()
  })

  it('calls mission_review_event_append alongside the submission update', async () => {
    const rpcMock = vi.fn(async () => ({ data: null, error: null }))
    const supabase = createSupabaseMock({
      merchant_profiles: createBuilder({
        maybeSingle: vi.fn(async () => ({ data: { id: 'merchant-profile-1' }, error: null })),
      }),
      mission_milestone_submissions: [
        createBuilder({
          single: vi.fn(async () => ({
            data: { id: 'submission-1', status: 'submitted', mission_participant_id: 'participant-1' },
            error: null,
          })),
        }),
        createBuilder({
          maybeSingle: vi.fn(async () => ({ data: { status: 'approved' }, error: null })),
        }),
      ],
      mission_participants: createBuilder({
        single: vi.fn(async () => ({ data: { mission_id: 'mission-1' }, error: null })),
      }),
      missions: createBuilder({
        maybeSingle: vi.fn(async () => ({ data: { id: 'mission-1' }, error: null })),
      }),
    }, { rpc: rpcMock })
    createSupabaseServerClientMock.mockResolvedValue(supabase)

    await reviewSubmissionAction({ submissionId: 'submission-1', action: 'approve', locale: 'en' })

    expect(rpcMock).toHaveBeenCalledWith('mission_review_event_append', {
      p_submission_id: 'submission-1', p_action: 'approve', p_reason_text: null,
    })
  })

  it('does not fail the review when the mission_review_event_append RPC errors', async () => {
    const rpcMock = vi.fn(async () => ({ data: null, error: { message: 'permission denied' } }))
    const supabase = createSupabaseMock({
      merchant_profiles: createBuilder({
        maybeSingle: vi.fn(async () => ({ data: { id: 'merchant-profile-1' }, error: null })),
      }),
      mission_milestone_submissions: [
        createBuilder({
          single: vi.fn(async () => ({
            data: { id: 'submission-1', status: 'submitted', mission_participant_id: 'participant-1' },
            error: null,
          })),
        }),
        createBuilder({
          maybeSingle: vi.fn(async () => ({ data: { status: 'approved' }, error: null })),
        }),
      ],
      mission_participants: createBuilder({
        single: vi.fn(async () => ({ data: { mission_id: 'mission-1' }, error: null })),
      }),
      missions: createBuilder({
        maybeSingle: vi.fn(async () => ({ data: { id: 'mission-1' }, error: null })),
      }),
    }, { rpc: rpcMock })
    createSupabaseServerClientMock.mockResolvedValue(supabase)

    const result = await reviewSubmissionAction({ submissionId: 'submission-1', action: 'approve', locale: 'en' })

    expect(result).toEqual({ ok: true, status: 'approved' })
  })
})

describe('createPartnerLinkAction adapter boundary', () => {
  it('maps a created result and revalidates once', async () => {
    const supabase = createSupabaseMock({}, {
      getUser: vi.fn(async () => ({
        data: { user: { id: 'user-1' } },
        error: null,
      })),
    })
    const store = { loadParticipant: vi.fn() }
    const provider = { create: vi.fn() }
    createSupabaseServerClientMock.mockResolvedValue(supabase)
    createPartnerLinkStoreMock.mockReturnValue(store)
    createTravelpayoutsPartnerLinkProviderMock.mockReturnValue(provider)
    createPartnerLinkCommandMock.mockResolvedValue({
      kind: 'created',
      link: { id: 'link-1', partnerUrl: 'https://tp.st/abc?sub_id=s1' },
    })

    await expect(createPartnerLinkAction({
      missionParticipantId: 'p1',
      originalUrl: 'https://example.com/hotel',
      locale: 'zh-hk',
    })).resolves.toEqual({
      ok: true,
      link: { id: 'link-1', partner_url: 'https://tp.st/abc?sub_id=s1' },
    })

    expect(createPartnerLinkCommandMock).toHaveBeenCalledWith(
      { id: 'user-1' },
      { missionParticipantId: 'p1', originalUrl: 'https://example.com/hotel' },
      { store, provider },
    )
    expect(revalidatePathMock).toHaveBeenCalledWith('/zh-hk/studio/missions')
  })

  it('maps a reused result without revalidation', async () => {
    const supabase = createSupabaseMock({}, {
      getUser: vi.fn(async () => ({
        data: { user: { id: 'user-1' } },
        error: null,
      })),
    })
    createSupabaseServerClientMock.mockResolvedValue(supabase)
    createPartnerLinkStoreMock.mockReturnValue({})
    createTravelpayoutsPartnerLinkProviderMock.mockReturnValue({})
    createPartnerLinkCommandMock.mockResolvedValue({
      kind: 'reused',
      link: { id: 'link-1', partnerUrl: 'https://tp.st/existing' },
    })

    await expect(createPartnerLinkAction({
      missionParticipantId: 'p1',
      originalUrl: 'https://example.com/hotel',
    })).resolves.toEqual({
      ok: true,
      link: { id: 'link-1', partner_url: 'https://tp.st/existing' },
    })
    expect(revalidatePathMock).not.toHaveBeenCalled()
  })

  it('maps validation and provider/save failures to existing form errors', async () => {
    const supabase = createSupabaseMock({}, {
      getUser: vi.fn(async () => ({
        data: { user: { id: 'user-1' } },
        error: null,
      })),
    })
    createSupabaseServerClientMock.mockResolvedValue(supabase)
    createPartnerLinkStoreMock.mockReturnValue({})
    createTravelpayoutsPartnerLinkProviderMock.mockReturnValue({})

    createPartnerLinkCommandMock.mockResolvedValueOnce({
      kind: 'validation-failed',
      errors: { originalUrl: ['https'] },
    })
    await expect(createPartnerLinkAction({
      missionParticipantId: 'p1',
      originalUrl: 'http://example.com',
    })).resolves.toEqual({
      ok: false,
      errors: { originalUrl: ['https'] },
    })

    createPartnerLinkCommandMock.mockResolvedValueOnce({
      kind: 'failed',
      code: 'provider-failed',
      reason: 'Unsupported link',
    })
    await expect(createPartnerLinkAction({
      missionParticipantId: 'p1',
      originalUrl: 'https://example.com/hotel',
    })).resolves.toEqual({
      ok: false,
      errors: {
        form: ['Travelpayouts partner link could not be generated: Unsupported link'],
      },
    })

    createPartnerLinkCommandMock.mockResolvedValueOnce({
      kind: 'failed',
      code: 'persistence-failed',
    })
    await expect(createPartnerLinkAction({
      missionParticipantId: 'p1',
      originalUrl: 'https://example.com/hotel',
    })).resolves.toEqual({
      ok: false,
      errors: { form: ['Partner link could not be saved'] },
    })
  })

  it.each([
    ['participant-not-found', 'Participant was not found'],
    ['mission-unavailable', 'Mission is not available'],
    ['program-unavailable', 'Affiliate program is not available'],
    ['partner-link-load-failed', 'Partner link could not be loaded'],
  ])('maps %s to an existing form error without revalidation', async (code, message) => {
    const supabase = createSupabaseMock({}, {
      getUser: vi.fn(async () => ({
        data: { user: { id: 'user-1' } },
        error: null,
      })),
    })
    createSupabaseServerClientMock.mockResolvedValue(supabase)
    createPartnerLinkStoreMock.mockReturnValue({})
    createTravelpayoutsPartnerLinkProviderMock.mockReturnValue({})
    createPartnerLinkCommandMock.mockResolvedValue({
      kind: 'failed',
      code,
    })

    await expect(createPartnerLinkAction({
      missionParticipantId: 'p1',
      originalUrl: 'https://example.com/hotel',
    })).resolves.toEqual({
      ok: false,
      errors: { form: [message] },
    })
    expect(revalidatePathMock).not.toHaveBeenCalled()
  })

  it('keeps the unauthenticated early return before adapter construction', async () => {
    const supabase = createSupabaseMock({}, {
      getUser: vi.fn(async () => ({
        data: { user: null },
        error: null,
      })),
    })
    createSupabaseServerClientMock.mockResolvedValue(supabase)

    await expect(createPartnerLinkAction({
      missionParticipantId: 'p1',
      originalUrl: 'https://example.com/hotel',
    })).resolves.toEqual({
      ok: false,
      errors: { form: ['Sign in is required'] },
    })
    expect(createPartnerLinkCommandMock).not.toHaveBeenCalled()
    expect(createPartnerLinkStoreMock).not.toHaveBeenCalled()
    expect(createTravelpayoutsPartnerLinkProviderMock).not.toHaveBeenCalled()
  })
})


describe('social enrichment boundary', () => {
  it('returns unavailable instead of throwing when enrichment is not configured', async () => {
    const { fetchSocialSnapshot } = await import('@/lib/missions/social-enrichment')

    await expect(
      fetchSocialSnapshot({ platform: 'instagram', proofUrl: 'https://instagram.com/p/demo' }),
    ).resolves.toMatchObject({
      confidenceStatus: 'unavailable',
    })
  })
})

describe('submitMilestoneAction', () => {
  it('rejects an invalid proof URL before any DB call', async () => {
    const supabase = createSupabaseMock({})
    createSupabaseServerClientMock.mockResolvedValue(supabase)
    const result = await submitMilestoneAction({
      missionId: 'm1', milestoneId: 'ms1', participantId: 'p1', proofUrl: 'not-a-url', locale: 'en',
    })
    expect(result).toEqual({ ok: false, errors: { proofUrl: ['url'] } })
  })

  it('inserts a submitted submission for the owning active participant', async () => {
    const submissionInsert = createBuilder({ single: vi.fn(async () => ({ data: { id: 'sub-1' }, error: null })) })
    const supabase = createSupabaseMock({
      mission_participants: createBuilder({
        maybeSingle: vi.fn(async () => ({ data: { id: 'p1', creator_id: 'user-1', status: 'active', mission_id: 'm1' }, error: null })),
      }),
      mission_milestone_submissions: [
        createBuilder({ maybeSingle: vi.fn(async () => ({ data: null, error: null })) }), // existing lookup → none
        submissionInsert, // insert
      ],
    })
    createSupabaseServerClientMock.mockResolvedValue(supabase)

    const result = await submitMilestoneAction({
      missionId: 'm1', milestoneId: 'ms1', participantId: 'p1',
      proofUrl: 'https://www.instagram.com/p/Cabc/', notes: 'live', locale: 'en',
    })

    expect(result).toEqual({ ok: true, submissionId: 'sub-1' })
    expect(submissionInsert.insert).toHaveBeenCalledWith({
      mission_milestone_id: 'ms1',
      mission_participant_id: 'p1',
      proof_urls: ['https://www.instagram.com/p/Cabc/'],
      notes: 'live',
      status: 'submitted',
      submitted_at: expect.any(String),
    })
  })

  it('rejects when the participant belongs to another creator', async () => {
    const supabase = createSupabaseMock({
      mission_participants: createBuilder({
        maybeSingle: vi.fn(async () => ({ data: { id: 'p1', creator_id: 'someone-else', status: 'active', mission_id: 'm1' }, error: null })),
      }),
    })
    createSupabaseServerClientMock.mockResolvedValue(supabase)
    const result = await submitMilestoneAction({
      missionId: 'm1', milestoneId: 'ms1', participantId: 'p1', proofUrl: 'https://instagram.com/p/x', locale: 'en',
    })
    expect(result).toEqual({ ok: false, errors: { form: ['Creator access is required'] } })
  })

  it('updates an existing revision_requested submission instead of inserting', async () => {
    const submissionUpdate = createBuilder({ single: vi.fn(async () => ({ data: { id: 'sub-1' }, error: null })) })
    const supabase = createSupabaseMock({
      mission_participants: createBuilder({
        maybeSingle: vi.fn(async () => ({ data: { id: 'p1', creator_id: 'user-1', status: 'active', mission_id: 'm1' }, error: null })),
      }),
      mission_milestone_submissions: [
        createBuilder({ maybeSingle: vi.fn(async () => ({ data: { id: 'sub-1', status: 'revision_requested' }, error: null })) }),
        submissionUpdate,
      ],
    })
    createSupabaseServerClientMock.mockResolvedValue(supabase)
    const result = await submitMilestoneAction({
      missionId: 'm1', milestoneId: 'ms1', participantId: 'p1', proofUrl: 'https://instagram.com/p/x', locale: 'en',
    })
    expect(result).toEqual({ ok: true, submissionId: 'sub-1' })
    expect(submissionUpdate.update).toHaveBeenCalled()
  })
})
