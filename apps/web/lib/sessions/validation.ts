// apps/web/lib/sessions/validation.ts
import { SESSION_TYPES, type SessionInput, type SessionType } from '@/lib/sessions/types'
import { parseSessionEmbedUrl } from '@/lib/sessions/embed'

export type ValidationErrors = Record<string, string[]>
export type ParsedSession = {
  title: string
  description: string
  type: SessionType
  startsAt: string // ISO
  durationMinutes: number
  embedUrl: string | null
  replayUrl: string | null
  destinationTags: string[]
}
export type SessionValidation =
  | { ok: true; parsed: ParsedSession }
  | { ok: false; errors: ValidationErrors }

/**
 * Preserves the creator's original casing — it round-trips into the Studio/admin
 * edit-form pre-fill, so it must not be silently rewritten here. Case-insensitive
 * matching against destinations.match_terms (which ops curates independently and
 * cannot be relied on to share a creator's casing) is handled entirely on the read
 * side via the generated `destination_tags_ci` column — see getSessionsForDestination
 * and migration 20260711120000_r6b_fix_session_destination_tags_ci_backfill.sql.
 */
function parseTags(raw: string): string[] {
  return raw.split(',').map((t) => t.trim()).filter(Boolean)
}

export function validateSessionInput(input: SessionInput): SessionValidation {
  const errors: ValidationErrors = {}

  const title = input.title.trim()
  if (!title) errors.title = ['required']
  else if (title.length > 160) errors.title = ['too_long']

  const description = input.description.trim()
  if (!description) errors.description = ['required']

  if (!(SESSION_TYPES as readonly string[]).includes(input.type)) errors.type = ['invalid']

  const startsAtDate = new Date(input.startsAt)
  if (Number.isNaN(startsAtDate.getTime())) errors.startsAt = ['invalid_date']

  const durationRaw = input.durationMinutes.trim()
  const duration = Number(durationRaw)
  if (!durationRaw || !Number.isInteger(duration) || duration <= 0) errors.durationMinutes = ['invalid_number']

  const embedUrl = input.embedUrl.trim()
  if (embedUrl && !parseSessionEmbedUrl(embedUrl)) errors.embedUrl = ['invalid_youtube_url']

  const replayUrl = input.replayUrl.trim()
  if (replayUrl && !parseSessionEmbedUrl(replayUrl)) errors.replayUrl = ['invalid_youtube_url']

  if (Object.keys(errors).length) return { ok: false, errors }
  return {
    ok: true,
    parsed: {
      title,
      description,
      type: input.type,
      startsAt: startsAtDate.toISOString(),
      durationMinutes: duration,
      embedUrl: embedUrl || null,
      replayUrl: replayUrl || null,
      destinationTags: parseTags(input.destinationTags),
    },
  }
}

/** D-R5-4: a session cannot be marked live with nothing to embed. */
export function canGoLive(session: { embedUrl: string | null }): boolean {
  return Boolean(session.embedUrl)
}
