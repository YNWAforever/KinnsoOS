// apps/web/lib/sessions/types.ts
export const SESSION_TYPES = ['destination_briefing', 'ask_a_creator', 'merchant_spotlight', 'new_creator_intro'] as const
export type SessionType = (typeof SESSION_TYPES)[number]

export const SESSION_STATUSES = ['scheduled', 'live', 'ended', 'cancelled'] as const
export type SessionStatus = (typeof SESSION_STATUSES)[number]

/** Form-string input shared by the Studio (creator) and ops create/edit forms. */
export type SessionInput = {
  title: string
  description: string
  type: SessionType
  startsAt: string // ISO or datetime-local form string; parsed/validated downstream
  durationMinutes: string // form-string; '' invalid, R5 always requires a value
  embedUrl: string // '' = not set yet
  replayUrl: string // '' = not set yet
  destinationTags: string // comma-separated form-string; parsed downstream
}

export type SessionListItem = {
  id: string; slug: string; title: string; type: SessionType
  startsAt: string; status: SessionStatus; embedUrl: string | null
}
