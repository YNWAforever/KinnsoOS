/**
 * Pure, framework-free handle validation for the three supported platforms.
 * Used by HandlesStep (client) and unit-tested directly.
 *
 * Format rules (intentionally conservative — the worker re-validates server-side):
 *  - instagram: letters/digits/`.`/`_`, 1–30 chars
 *  - youtube:   letters/digits/`.`/`_`/`-`, 1–30 chars (the `@handle`, not a channel id)
 *  - threads:   letters/digits/`_`, 1–30 chars (no dots)
 */
import type { Platform } from '@kinnso/scan'

// `Platform` is defined canonically by the zod `PlatformEnum` in `@kinnso/scan`
// (the DNA schema's source of truth). Re-export it here so handle validation and
// the DNA schema can never silently drift to two different unions.
export type { Platform }

// Supported platforms in display order. `satisfies` ties the runtime values to the
// canonical union, so a mismatch with `@kinnso/scan` is a compile error, not a
// silent structural-typing coincidence.
export const PLATFORMS = ['instagram', 'youtube', 'threads'] as const satisfies readonly Platform[]

export function isPlatform(x: string): x is Platform {
  return (PLATFORMS as readonly string[]).includes(x)
}

/** Strip surrounding whitespace, a leading `@`, and a profile URL down to the bare handle. */
export function normalizeHandle(raw: string): string {
  let s = raw.trim()
  // Pull the last non-empty path segment out of a URL (instagram.com/x/, youtube.com/@x).
  const urlMatch = s.match(/^https?:\/\/[^/]+\/(.+)$/i)
  if (urlMatch) {
    const segs = urlMatch[1].split('/').filter(Boolean)
    s = segs[0] ?? ''
  }
  if (s.startsWith('@')) s = s.slice(1)
  return s.trim()
}

const PATTERNS: Record<Platform, RegExp> = {
  instagram: /^[A-Za-z0-9._]+$/,
  youtube: /^[A-Za-z0-9._-]+$/,
  threads: /^[A-Za-z0-9_]+$/,
}
const MAX_LEN = 30

export type HandleValidation =
  | { ok: true; value: string }
  | { ok: false; error: 'empty' | 'format' | 'length' | 'platform' }

export function validateHandle(platform: string, raw: string): HandleValidation {
  if (!isPlatform(platform)) return { ok: false, error: 'platform' }
  const value = normalizeHandle(raw)
  if (value.length === 0) return { ok: false, error: 'empty' }
  if (value.length > MAX_LEN) return { ok: false, error: 'length' }
  if (!PATTERNS[platform].test(value)) return { ok: false, error: 'format' }
  return { ok: true, value }
}

/** Build the public profile URL for a validated handle (stored alongside it). */
export function handleUrl(platform: Platform, value: string): string {
  switch (platform) {
    case 'instagram':
      return `https://www.instagram.com/${value}/`
    case 'youtube':
      return `https://www.youtube.com/@${value}`
    case 'threads':
      return `https://www.threads.net/@${value}`
  }
}
