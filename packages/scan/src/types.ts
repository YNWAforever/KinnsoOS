import type { Platform } from './schema'

/** Normalised view of public signals scraped from ONE platform profile. */
export interface NormalizedSignals {
  platform: Platform
  handle: string
  followers?: number
  avg_engagement?: number
  post_cadence?: string
  bio?: string
  /** Captions, titles, or post text — fed into the LLM prompt. */
  recent_text: string[]
}

/** A single message in the LLM conversation. */
export interface LlmMessage {
  role: 'system' | 'user'
  content: string
}

/**
 * Abstraction over any LLM provider.
 * Plan 3 (worker) provides the real implementation; tests inject a fake.
 */
export interface LlmClient {
  complete(messages: LlmMessage[]): Promise<string>
}

/**
 * Abstraction over raw platform data fetching.
 * A single `fetch(platform, handle)` entry point dispatches by platform —
 * mirroring the pure `normalize(platform, handle, raw)` dispatcher below.
 * Plan 3 (worker) provides real implementations (RapidAPI, YouTube Data API).
 * Tests inject fake objects satisfying this interface.
 */
export interface PlatformFetcher {
  fetch(platform: Platform, handle: string): Promise<unknown>
}
