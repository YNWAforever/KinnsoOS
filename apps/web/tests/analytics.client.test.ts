// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import {
  CONSENT_KEY,
  CONSENT_VERSION_KEY,
  JOURNEY_KEY,
  grantAnalyticsConsent,
  hasAnalyticsConsent,
  revokeAnalyticsConsent,
  trackTravellerEvent,
} from '@/lib/analytics/client'

const flush = () => new Promise((resolve) => setTimeout(resolve, 0))

describe('traveller analytics client', () => {
  beforeEach(() => {
    localStorage.clear()
    vi.stubEnv('NEXT_PUBLIC_ANALYTICS_MODE', 'production')
    vi.stubGlobal('crypto', { randomUUID: vi.fn()
      .mockReturnValueOnce('11111111-1111-4111-8111-111111111111')
      .mockReturnValue('22222222-2222-4222-8222-222222222222') })
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(null, { status: 202 })))
  })

  afterEach(() => {
    vi.restoreAllMocks()
    vi.unstubAllEnvs()
    vi.unstubAllGlobals()
  })

  it('does not create storage or send a request before opt-in', async () => {
    trackTravellerEvent('agent_started', { locale: 'en', routeKey: 'agent' })
    await flush()

    expect(localStorage.length).toBe(0)
    expect(fetch).not.toHaveBeenCalled()
    expect(crypto.randomUUID).not.toHaveBeenCalled()
  })

  it('creates a journey and starts it when consent is granted', async () => {
    grantAnalyticsConsent('en')
    await flush()

    expect(localStorage.getItem(CONSENT_KEY)).toBe('accepted')
    expect(localStorage.getItem(CONSENT_VERSION_KEY)).toMatch(/^v1:\d+$/)
    expect(localStorage.getItem(JOURNEY_KEY)).toBe('11111111-1111-4111-8111-111111111111')
    expect(fetch).toHaveBeenCalledOnce()
    expect(JSON.parse(vi.mocked(fetch).mock.calls[0][1]?.body as string)).toMatchObject({
      event: 'journey_started', locale: 'en', routeKey: 'journey',
    })
  })

  it('retries exactly once after a network failure', async () => {
    vi.stubGlobal('fetch', vi.fn()
      .mockRejectedValueOnce(new TypeError('offline'))
      .mockResolvedValueOnce(new Response(null, { status: 202 })))
    grantAnalyticsConsent('en')
    await flush()
    await flush()

    expect(fetch).toHaveBeenCalledTimes(2)
  })

  it('does not retry a 4xx response', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(null, { status: 400 })))
    grantAnalyticsConsent('en')
    await flush()

    expect(fetch).toHaveBeenCalledOnce()
  })

  it('clears consent and journey keys on revocation', async () => {
    grantAnalyticsConsent('en')
    await flush()
    revokeAnalyticsConsent()

    expect(localStorage.getItem(CONSENT_KEY)).toBeNull()
    expect(localStorage.getItem(CONSENT_VERSION_KEY)).toBeNull()
    expect(localStorage.getItem(JOURNEY_KEY)).toBeNull()
  })

  it('rotates an expired journey while preserving consent and emitting a new start', async () => {
    grantAnalyticsConsent('en')
    const previousJourney = localStorage.getItem(JOURNEY_KEY)
    const now = Date.now()
    vi.spyOn(Date, 'now').mockReturnValue(now + 8 * 24 * 60 * 60 * 1_000)

    expect(hasAnalyticsConsent()).toBe(true)
    expect(localStorage.getItem(CONSENT_KEY)).toBe('accepted')
    trackTravellerEvent('agent_started', { locale: 'en', routeKey: 'agent' })
    await flush()

    expect(localStorage.getItem(JOURNEY_KEY)).not.toBe(previousJourney)
    expect(localStorage.getItem(CONSENT_VERSION_KEY)).toMatch(/^v1:\d+$/)
    expect(fetch).toHaveBeenCalledTimes(3)
    expect(JSON.parse(vi.mocked(fetch).mock.calls[1][1]?.body as string)).toMatchObject({ event: 'journey_started' })
    expect(JSON.parse(vi.mocked(fetch).mock.calls[2][1]?.body as string)).toMatchObject({ event: 'agent_started' })
  })

  it('rolls back all keys when consent storage setup is interrupted', () => {
    const setItem = vi.spyOn(Storage.prototype, 'setItem')
    setItem.mockImplementationOnce(() => undefined).mockImplementationOnce(() => { throw new Error('blocked') })

    expect(grantAnalyticsConsent('en')).toBe(false)
    expect(localStorage.getItem(CONSENT_KEY)).toBeNull()
    expect(localStorage.getItem(CONSENT_VERSION_KEY)).toBeNull()
    expect(localStorage.getItem(JOURNEY_KEY)).toBeNull()
  })

  it('fails closed without fetching when privacy-restricted storage throws', async () => {
    const storageError = new DOMException('Storage is disabled', 'SecurityError')
    const restrictedStorage = {
      getItem: vi.fn(() => { throw storageError }),
      setItem: vi.fn(() => { throw storageError }),
      removeItem: vi.fn(() => { throw storageError }),
    } as unknown as Storage
    const localStorageGetter = vi.spyOn(window, 'localStorage', 'get')

    localStorageGetter.mockImplementationOnce(() => { throw storageError })
    expect(() => trackTravellerEvent('agent_started', { locale: 'en', routeKey: 'agent' })).not.toThrow()

    localStorageGetter.mockImplementation(() => restrictedStorage)

    expect(() => trackTravellerEvent('agent_started', { locale: 'en', routeKey: 'agent' })).not.toThrow()
    expect(() => grantAnalyticsConsent('en')).not.toThrow()
    expect(() => revokeAnalyticsConsent()).not.toThrow()
    await flush()

    expect(restrictedStorage.getItem).toHaveBeenCalled()
    expect(restrictedStorage.setItem).toHaveBeenCalledWith(CONSENT_KEY, 'accepted')
    expect(restrictedStorage.removeItem).toHaveBeenCalledWith(JOURNEY_KEY)
    expect(fetch).not.toHaveBeenCalled()
  })
})
