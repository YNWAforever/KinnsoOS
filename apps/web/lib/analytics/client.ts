'use client'

import type { Locale } from '@/lib/i18n/config'
import { travellerAnalyticsPayloadSchema, type TravellerAnalyticsEventName } from '@/lib/analytics/contracts'
import { getAnalyticsMode } from '@/lib/analytics/config'

export const CONSENT_KEY = 'kinnso.analytics.consent.v1'
export const CONSENT_VERSION_KEY = 'kinnso.analytics.consent-version.v1'
export const JOURNEY_KEY = 'kinnso.analytics.journey.v1'
const CONSENT_VERSION = 'v1'
const JOURNEY_TTL_MS = 7 * 24 * 60 * 60 * 1_000

type ConsentSubscriber = () => void
const consentSubscribers = new Set<ConsentSubscriber>()

type CommonMetadata = { locale: Locale }
type ExperienceMetadata = CommonMetadata & {
  routeKey: 'experience_detail'
  entityType: 'experience'
  entityId: string
}
type OfferMetadata = CommonMetadata & {
  routeKey: 'guide_detail' | 'creator_profile'
  entityType: 'offer'
  entityId: string
}

export type TravellerAnalyticsMetadataByEvent = {
  journey_started: CommonMetadata & { routeKey: 'journey' }
  entity_viewed: CommonMetadata & (
    | { routeKey: 'guide_detail'; entityType: 'guide'; entityId: string }
    | { routeKey: 'experience_detail'; entityType: 'experience'; entityId: string }
    | { routeKey: 'creator_profile'; entityType: 'creator'; entityId: string }
    | { routeKey: 'article_detail'; entityType: 'article'; entityId: string }
  )
  agent_started: CommonMetadata & { routeKey: 'agent' }
  booking_cta_clicked: ExperienceMetadata & { bookingState: 'off' | 'on' }
  waitlist_submitted: ExperienceMetadata & {
    bookingState: 'off'
    outcome: 'submitted'
  } | (ExperienceMetadata & {
    bookingState: 'off'
    outcome: 'error'
    errorCategory: 'invalid' | 'rate_limited' | 'unavailable' | 'unknown'
  })
  checkout_started: ExperienceMetadata & {
    bookingState: 'on'
    outcome: 'created'
  } | (ExperienceMetadata & {
    bookingState: 'on'
    outcome: 'error'
    errorCategory: 'invalid' | 'rate_limited' | 'unavailable' | 'unknown'
  })
  offer_viewed: OfferMetadata
  offer_claimed: OfferMetadata
  signup_started: CommonMetadata & { routeKey: 'sign_up' }
  signup_completed: CommonMetadata & {
    routeKey: 'sign_up'
    outcome: 'success'
  } | (CommonMetadata & {
    routeKey: 'sign_up'
    outcome: 'error'
    errorCategory: 'invalid' | 'rate_limited' | 'unavailable' | 'unknown'
  })
}

function getPublicAnalyticsMode() {
  return getAnalyticsMode({ NEXT_PUBLIC_ANALYTICS_MODE: process.env.NEXT_PUBLIC_ANALYTICS_MODE })
}

function getStorage(): Storage | null {
  try {
    return typeof window === 'undefined' ? null : window.localStorage
  } catch {
    return null
  }
}

function getStorageValue(storage: Storage | null, key: string): string | null {
  try {
    return storage?.getItem(key) ?? null
  } catch {
    return null
  }
}

function setStorageValue(storage: Storage | null, key: string, value: string): boolean {
  try {
    storage?.setItem(key, value)
    return storage !== null
  } catch {
    return false
  }
}

function removeStorageValue(storage: Storage | null, key: string): void {
  try {
    storage?.removeItem(key)
  } catch {
    // Measurement storage is optional and must never interrupt product flows.
  }
}

function randomUuid(): string | null {
  if (typeof window === 'undefined' || typeof window.crypto?.randomUUID !== 'function') return null
  try {
    return window.crypto.randomUUID()
  } catch {
    return null
  }
}

export function hasAnalyticsConsent(): boolean {
  if (getPublicAnalyticsMode() === 'disabled') return false
  const storage = getStorage()
  if (getStorageValue(storage, CONSENT_KEY) !== 'accepted') return false
  const journeyId = getStorageValue(storage, JOURNEY_KEY)
  const expiresAt = parseJourneyExpiry(getStorageValue(storage, CONSENT_VERSION_KEY))
  if (expiresAt !== null && expiresAt <= Date.now()) {
    // The consent decision remains valid; ensureJourney rotates the expired
    // journey before the next event and emits a fresh journey_started event.
    return true
  }
  if (!isJourneyId(journeyId) || expiresAt === null) {
    clearMeasurementStorage(storage)
    return false
  }
  return true
}

/**
 * Returns the journey id currently in storage, or null if there is no active
 * consent. Near TTL expiry this may return a stale id that trackTravellerEvent
 * will rotate on its next call (via ensureJourney) -- do not cache this value
 * across an event boundary or assume it matches the id the next tracked event
 * actually gets tagged with.
 */
export function getCurrentJourneyId(): string | null {
  if (!hasAnalyticsConsent()) return null
  const storage = getStorage()
  const journeyId = getStorageValue(storage, JOURNEY_KEY)
  return isJourneyId(journeyId) ? journeyId : null
}

export function subscribeToAnalyticsConsent(callback: ConsentSubscriber): () => void {
  consentSubscribers.add(callback)
  return () => consentSubscribers.delete(callback)
}

function notifyConsentSubscribers() {
  for (const callback of consentSubscribers) {
    try {
      callback()
    } catch {
      // A measurement subscriber must never interrupt a product action.
    }
  }
}

function journeyExpiryValue(expiresAt: number) {
  return `${CONSENT_VERSION}:${expiresAt}`
}

function parseJourneyExpiry(value: string | null): number | null {
  if (!value) return null
  const [version, rawExpiresAt] = value.split(':')
  if (version !== CONSENT_VERSION || !rawExpiresAt) return null
  const expiresAt = Number(rawExpiresAt)
  return Number.isFinite(expiresAt) ? expiresAt : null
}

function isJourneyId(value: string | null): value is string {
  return value !== null && /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value)
}

function clearMeasurementStorage(storage: Storage | null) {
  removeStorageValue(storage, CONSENT_KEY)
  removeStorageValue(storage, CONSENT_VERSION_KEY)
  removeStorageValue(storage, JOURNEY_KEY)
}

function ensureJourney(locale: Locale): string | null {
  const storage = getStorage()
  if (!storage || getStorageValue(storage, CONSENT_KEY) !== 'accepted') return null

  const currentJourneyId = getStorageValue(storage, JOURNEY_KEY)
  const expiresAt = parseJourneyExpiry(getStorageValue(storage, CONSENT_VERSION_KEY))
  if (isJourneyId(currentJourneyId) && expiresAt !== null && expiresAt > Date.now()) return currentJourneyId

  const journeyId = randomUuid()
  if (!journeyId) return null
  const nextExpiresAt = Date.now() + JOURNEY_TTL_MS
  if (!setStorageValue(storage, JOURNEY_KEY, journeyId) || !setStorageValue(storage, CONSENT_VERSION_KEY, journeyExpiryValue(nextExpiresAt))) {
    clearMeasurementStorage(storage)
    notifyConsentSubscribers()
    return null
  }

  trackTravellerEvent('journey_started', { locale, routeKey: 'journey' })
  return journeyId
}

export function grantAnalyticsConsent(locale: Locale): boolean {
  if (getPublicAnalyticsMode() === 'disabled') return false
  const storage = getStorage()
  const journeyId = randomUuid()
  if (!storage || !journeyId) return false

  const expiresAt = Date.now() + JOURNEY_TTL_MS
  if (!setStorageValue(storage, CONSENT_KEY, 'accepted')
    || !setStorageValue(storage, CONSENT_VERSION_KEY, journeyExpiryValue(expiresAt))
    || !setStorageValue(storage, JOURNEY_KEY, journeyId)) {
    clearMeasurementStorage(storage)
    notifyConsentSubscribers()
    return false
  }
  notifyConsentSubscribers()
  trackTravellerEvent('journey_started', { locale, routeKey: 'journey' })
  return true
}

export function revokeAnalyticsConsent(): void {
  const storage = getStorage()
  removeStorageValue(storage, CONSENT_KEY)
  removeStorageValue(storage, CONSENT_VERSION_KEY)
  removeStorageValue(storage, JOURNEY_KEY)
  notifyConsentSubscribers()
}

async function postWithOneRetry(payload: unknown): Promise<void> {
  for (let attempt = 0; attempt < 2; attempt += 1) {
    try {
      const response = await fetch('/api/analytics', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(payload),
        keepalive: true,
      })
      if (response.status < 500 || attempt === 1) return
    } catch {
      if (attempt === 1) return
    }
  }
}

export function trackTravellerEvent<Event extends TravellerAnalyticsEventName>(
  event: Event,
  metadata: TravellerAnalyticsMetadataByEvent[Event],
): void {
  if (!hasAnalyticsConsent() || getPublicAnalyticsMode() === 'disabled') return
  const journeyId = ensureJourney(metadata.locale)
  if (!journeyId) return
  const clientEventId = randomUuid()
  if (!clientEventId) return

  const payload = {
    clientEventId,
    journeyId,
    consentVersion: 'v1' as const,
    event,
    occurredAt: new Date().toISOString(),
    ...metadata,
  }
  if (!travellerAnalyticsPayloadSchema.safeParse(payload).success) return

  void postWithOneRetry(payload)
}
