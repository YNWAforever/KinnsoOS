import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('server-only', () => ({}))

import {
  buildSubId,
  canonicalizeTravelpayoutsPartnerUrl,
  createTravelpayoutsPartnerLinks,
  fetchTravelpayoutsActions,
  normalizeTravelpayoutsAction,
} from '@/lib/missions/travelpayouts'

afterEach(() => {
  vi.restoreAllMocks()
  vi.unstubAllEnvs()
  vi.unstubAllGlobals()
})

describe('Travelpayouts adapter', () => {
  it('builds stable creator tracking sub_id', () => {
    expect(buildSubId({ missionId: 'm1', participantId: 'p1', creatorId: 'c1' })).toBe('kinnso_m_m1_p_p1_c_c1')
  })

  it('strips UUID hyphens so the sub_id is Travelpayouts-legal ([0-9A-Za-z_] only)', () => {
    const missionId = '389edc00-ed11-468e-a289-52215930c8c0'
    const participantId = 'dd24c548-aae0-4567-b08a-8f8185b186d1'
    const creatorId = 'a0000000-0000-4000-a000-00000000ad01'
    const subId = buildSubId({ missionId, participantId, creatorId })
    // The load-bearing property: no hyphens, only Travelpayouts-legal characters.
    expect(subId).not.toContain('-')
    expect(subId).toMatch(/^[0-9A-Za-z_]+$/)
    expect(subId).toContain(creatorId.replace(/-/g, '')) // creator still recoverable for attribution
    expect(subId.length).toBeLessThanOrEqual(4096)
  })

  it('canonicalizes a Travelpayouts short link with the deterministic SubID', () => {
    expect(
      canonicalizeTravelpayoutsPartnerUrl(
        'https://brand.tp.st/path?sub_id=wrong&erid=campaign',
        'creator_sub',
      ),
    ).toBe('https://brand.tp.st/path?sub_id=creator_sub&erid=campaign')

    expect(
      canonicalizeTravelpayoutsPartnerUrl('https://tp.st/path', 'creator_sub'),
    ).toBe('https://tp.st/path?sub_id=creator_sub')
  })

  it('canonicalizes a nested Travelpayouts host with one deterministic SubID', () => {
    const subId = buildSubId({
      missionId: '389edc00-ed11-468e-a289-52215930c8c0',
      participantId: 'dd24c548-aae0-4567-b08a-8f8185b186d1',
      creatorId: 'a0000000-0000-4000-a000-00000000ad01',
    })

    const canonical = new URL(canonicalizeTravelpayoutsPartnerUrl(
      'https://a.b.tp.st/path?sub_id=wrong&sub_id=duplicate',
      subId,
    ))

    expect(canonical.hostname).toBe('a.b.tp.st')
    expect(canonical.searchParams.getAll('sub_id')).toEqual([subId])
  })

  it.each([
    'https://a.b.tp.st/path',
    'https://valid-label.deep-host.tp.st/path',
  ])('accepts a valid Travelpayouts hostname: %s', (partnerUrl) => {
    expect(canonicalizeTravelpayoutsPartnerUrl(partnerUrl, 'creator_sub'))
      .toBe(`${partnerUrl}?sub_id=creator_sub`)
  })

  it.each([
    'https://.tp.st/path',
    'https://a..tp.st/path',
    'https://foo_bar.tp.st/path',
    'https://-edge.tp.st/path',
    'https://edge-.tp.st/path',
  ])('rejects a malformed Travelpayouts hostname: %s', (partnerUrl) => {
    expect(() => canonicalizeTravelpayoutsPartnerUrl(partnerUrl, 'creator_sub'))
      .toThrow('Travelpayouts returned an invalid partner URL')
  })
  it('collapses duplicate SubIDs, preserves unrelated parameters, and clears fragments', () => {
    expect(
      canonicalizeTravelpayoutsPartnerUrl(
        'https://brand.tp.st/path?sub_id=wrong&erid=campaign&sub_id=other#details',
        'creator_sub',
      ),
    ).toBe('https://brand.tp.st/path?sub_id=creator_sub&erid=campaign')
  })

  it.each([
    'http://brand.tp.st/path',
    'https://brand.tp.st.evil.example/path',
    'https://example.com/path',
    'https://user:pass@tp.st/path',
    'https://tp.st:8443/path',
    'not-a-url',
  ])('rejects an untrusted partner URL: %s', (partnerUrl) => {
    expect(() => canonicalizeTravelpayoutsPartnerUrl(partnerUrl, 'creator_sub'))
      .toThrow('Travelpayouts returned an invalid partner URL')
  })

  it('rejects a SubID outside the Travelpayouts-safe character set', () => {
    expect(() => canonicalizeTravelpayoutsPartnerUrl('https://tp.st/path', 'bad-sub'))
      .toThrow('Travelpayouts SubID is invalid')
  })

  it('creates partner links with server-side token and marker', async () => {
    vi.stubEnv('TRAVELPAYOUTS_API_TOKEN', 'test-token')
    vi.stubEnv('TRAVELPAYOUTS_PROJECT_ID', '197987')
    vi.stubEnv('TRAVELPAYOUTS_MARKER', '339296')
    const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify({
      code: 'success',
      status: 200,
      result: {
        links: [{ url: 'https://example.com/hotel', code: 'success', partner_url: 'https://tp.st/abc' }],
      },
    })))
    vi.stubGlobal('fetch', fetchMock)

    const result = await createTravelpayoutsPartnerLinks({
      links: [{ url: 'https://example.com/hotel', subId: 'creator-sub' }],
      shorten: true,
    })

    expect(result).toEqual([{ originalUrl: 'https://example.com/hotel', partnerUrl: 'https://tp.st/abc', status: 'success' }])
    expect(fetchMock).toHaveBeenCalledWith(
      'https://api.travelpayouts.com/links/v1/create',
      expect.objectContaining({
        method: 'POST',
        headers: expect.objectContaining({ 'X-Access-Token': 'test-token' }),
      }),
    )
    expect(JSON.parse(fetchMock.mock.calls[0][1].body)).toEqual({
      trs: 197987,
      marker: 339296,
      shorten: true,
      links: [{ url: 'https://example.com/hotel', sub_id: 'creator-sub' }],
    })
  })

  it('maps non-success partner link codes to failed', async () => {
    vi.stubEnv('TRAVELPAYOUTS_API_TOKEN', 'test-token')
    vi.stubEnv('TRAVELPAYOUTS_PROJECT_ID', '197987')
    vi.stubEnv('TRAVELPAYOUTS_MARKER', '339296')
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(JSON.stringify({
      result: {
        links: [{
          url: 'https://example.com/hotel',
          code: 'invalid_url',
          message: 'Unsupported link',
        }],
      },
    }))))

    await expect(createTravelpayoutsPartnerLinks({
      links: [{ url: 'https://example.com/hotel', subId: 'creator-sub' }],
    })).resolves.toEqual([{
      originalUrl: 'https://example.com/hotel',
      partnerUrl: '',
      status: 'failed',
      message: 'Unsupported link',
    }])
  })

  it('throws for missing server-side configuration without exposing configured secrets', async () => {
    vi.stubEnv('TRAVELPAYOUTS_API_TOKEN', 'test-token')
    vi.stubEnv('TRAVELPAYOUTS_PROJECT_ID', '')
    vi.stubEnv('TRAVELPAYOUTS_MARKER', '339296')
    const fetchMock = vi.fn()
    vi.stubGlobal('fetch', fetchMock)

    await expect(createTravelpayoutsPartnerLinks({
      links: [{ url: 'https://example.com/hotel', subId: 'creator-sub' }],
    })).rejects.toThrow('Missing required environment variable: TRAVELPAYOUTS_PROJECT_ID')
    await expect(createTravelpayoutsPartnerLinks({
      links: [{ url: 'https://example.com/hotel', subId: 'creator-sub' }],
    })).rejects.not.toThrow('test-token')
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('rejects more than 10 links before calling the API', async () => {
    vi.stubEnv('TRAVELPAYOUTS_API_TOKEN', 'test-token')
    vi.stubEnv('TRAVELPAYOUTS_PROJECT_ID', '197987')
    vi.stubEnv('TRAVELPAYOUTS_MARKER', '339296')
    const fetchMock = vi.fn()
    vi.stubGlobal('fetch', fetchMock)

    await expect(createTravelpayoutsPartnerLinks({
      links: Array.from({ length: 11 }, (_, index) => ({
        url: `https://example.com/hotel-${index}`,
        subId: `creator-sub-${index}`,
      })),
    })).rejects.toThrow('Travelpayouts accepts no more than 10 links per request')
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('throws when the partner link API returns a non-OK response', async () => {
    vi.stubEnv('TRAVELPAYOUTS_API_TOKEN', 'test-token')
    vi.stubEnv('TRAVELPAYOUTS_PROJECT_ID', '197987')
    vi.stubEnv('TRAVELPAYOUTS_MARKER', '339296')
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response('rate limited', { status: 429 })))

    await expect(createTravelpayoutsPartnerLinks({
      links: [{ url: 'https://example.com/hotel', subId: 'creator-sub' }],
    })).rejects.toThrow('Travelpayouts partner link request failed: 429')
  })

  it('normalizes Travelpayouts finance/statistics actions', () => {
    expect(normalizeTravelpayoutsAction({
      action_id: '100:123',
      campaign_id: 100,
      action_state: 'paid',
      sub_id: 'kinnso_m_m1_p_p1_c_c1',
      price: '100.00',
      profit: '8.50',
      currency: 'usd',
      booked_at: '2026-06-18 10:00:00',
      updated_at: '2026-06-18 11:00:00',
    })).toMatchObject({
      externalActionId: '100:123',
      externalProgramId: '100',
      eventState: 'paid',
      subId: 'kinnso_m_m1_p_p1_c_c1',
      priceAmount: 100,
      profitAmount: 8.5,
      currency: 'usd',
      bookedAt: '2026-06-18 10:00:00',
      updatedAt: '2026-06-18 11:00:00',
    })
  })

  it('normalizes Travelpayouts fallback finance/statistics fields', () => {
    expect(normalizeTravelpayoutsAction({
      action_id: '100:456',
      campaign_id: '100',
      state: 'confirmed',
      sub_id: 'kinnso_m_m2_p_p2_c_c2',
      price_usd: '99.20',
      paid_profit_usd: '7.35',
      date: '2026-06-19',
    })).toMatchObject({
      externalActionId: '100:456',
      externalProgramId: '100',
      eventState: 'unknown',
      subId: 'kinnso_m_m2_p_p2_c_c2',
      priceAmount: 99.2,
      profitAmount: 7.35,
      currency: 'usd',
      bookedAt: '2026-06-19',
    })
  })

  it('lowercases provided Travelpayouts currency values', () => {
    expect(normalizeTravelpayoutsAction({
      action_id: '100:789',
      action_state: 'paid',
      price: '100.00',
      profit: '8.50',
      currency: 'HKD',
    })).toMatchObject({
      currency: 'hkd',
    })
  })

  it('normalizes canceled Travelpayouts states to cancelled', () => {
    expect(normalizeTravelpayoutsAction({
      action_id: '100:999',
      state: 'canceled',
    })).toMatchObject({
      eventState: 'cancelled',
    })
  })
})

describe('fetchTravelpayoutsActions', () => {
  it('calls the Finance v2 endpoint with X-Access-Token and pagination params, normalizing each action', async () => {
    vi.stubEnv('TRAVELPAYOUTS_API_TOKEN', 'tok')
    const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify({
      actions: [{ action_id: 'a1', campaign_id: '101', action_state: 'paid', price: 100, profit: 10, booked_at: '2026-07-01', updated_at: '2026-07-02' }],
    })))
    vi.stubGlobal('fetch', fetchMock)

    const actions = await fetchTravelpayoutsActions({ from: '2026-06-28' })

    expect(fetchMock).toHaveBeenCalledTimes(1)
    const calledUrl = new URL(fetchMock.mock.calls[0][0] as string)
    expect(calledUrl.origin + calledUrl.pathname).toBe('https://api.travelpayouts.com/finance/v2/get_user_actions_affecting_balance')
    expect(calledUrl.searchParams.get('currency')).toBe('usd')
    expect(calledUrl.searchParams.get('limit')).toBe('300')
    expect(calledUrl.searchParams.get('offset')).toBe('0')
    expect(calledUrl.searchParams.get('from')).toBe('2026-06-28')
    expect(fetchMock.mock.calls[0][1]).toMatchObject({ method: 'GET', headers: { 'X-Access-Token': 'tok' } })
    expect(actions).toEqual([expect.objectContaining({ externalActionId: 'a1', eventState: 'paid', priceAmount: 100, profitAmount: 10 })])
  })

  it('paginates until a short page, respecting a maxPages safety cap', async () => {
    vi.stubEnv('TRAVELPAYOUTS_API_TOKEN', 'tok')
    const fullPage = Array.from({ length: 300 }, (_, i) => ({ action_id: `p1-${i}`, action_state: 'paid' }))
    const shortPage = [{ action_id: 'p2-0', action_state: 'paid' }]
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(new Response(JSON.stringify({ actions: fullPage })))
      .mockResolvedValueOnce(new Response(JSON.stringify({ actions: shortPage })))
    vi.stubGlobal('fetch', fetchMock)

    const actions = await fetchTravelpayoutsActions()
    expect(fetchMock).toHaveBeenCalledTimes(2)
    expect(actions).toHaveLength(301)
  })

  it('stops at maxPages even when every page is full (never loops unbounded)', async () => {
    vi.stubEnv('TRAVELPAYOUTS_API_TOKEN', 'tok')
    const fullPage = () => Array.from({ length: 300 }, (_, i) => ({ action_id: `p-${i}`, action_state: 'paid' }))
    const fetchMock = vi.fn().mockImplementation(async () => new Response(JSON.stringify({ actions: fullPage() })))
    vi.stubGlobal('fetch', fetchMock)

    const actions = await fetchTravelpayoutsActions({ maxPages: 2 })
    expect(fetchMock).toHaveBeenCalledTimes(2)
    expect(actions).toHaveLength(600)
  })

  it('throws with the response body on a non-ok response (never swallows a real API error)', async () => {
    vi.stubEnv('TRAVELPAYOUTS_API_TOKEN', 'tok')
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response('Unauthorized', { status: 401 })))
    await expect(fetchTravelpayoutsActions()).rejects.toThrow(/401.*Unauthorized/)
  })
})

import { isTravelpayoutsConfigured } from '@/lib/missions/travelpayouts'

describe('isTravelpayoutsConfigured', () => {
  const KEYS = ['TRAVELPAYOUTS_API_TOKEN', 'TRAVELPAYOUTS_PROJECT_ID', 'TRAVELPAYOUTS_MARKER'] as const
  const saved: Record<string, string | undefined> = {}
  // Snapshot the real env before EACH test and restore after, so cases don't leak.
  beforeEach(() => {
    for (const k of KEYS) saved[k] = process.env[k]
  })
  afterEach(() => {
    for (const k of KEYS) {
      if (saved[k] === undefined) delete process.env[k]
      else process.env[k] = saved[k]
    }
  })
  const set = (key: (typeof KEYS)[number], value?: string) => {
    if (value === undefined) delete process.env[key]
    else process.env[key] = value
  }

  it('is true only when token + numeric project + numeric marker are all present', () => {
    set('TRAVELPAYOUTS_API_TOKEN', 'tok'); set('TRAVELPAYOUTS_PROJECT_ID', '123'); set('TRAVELPAYOUTS_MARKER', '456')
    expect(isTravelpayoutsConfigured()).toBe(true)
  })
  it('is false when the token is missing', () => {
    set('TRAVELPAYOUTS_API_TOKEN', undefined); set('TRAVELPAYOUTS_PROJECT_ID', '123'); set('TRAVELPAYOUTS_MARKER', '456')
    expect(isTravelpayoutsConfigured()).toBe(false)
  })
  it('is false when project/marker are not numeric', () => {
    set('TRAVELPAYOUTS_API_TOKEN', 'tok'); set('TRAVELPAYOUTS_PROJECT_ID', 'abc'); set('TRAVELPAYOUTS_MARKER', '456')
    expect(isTravelpayoutsConfigured()).toBe(false)
  })
  it('is false when project/marker are present but blank (Number("")===0 guard)', () => {
    set('TRAVELPAYOUTS_API_TOKEN', 'tok'); set('TRAVELPAYOUTS_PROJECT_ID', ''); set('TRAVELPAYOUTS_MARKER', '   ')
    expect(isTravelpayoutsConfigured()).toBe(false)
  })
})
