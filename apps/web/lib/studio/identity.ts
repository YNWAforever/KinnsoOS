import type { Dna, Platform } from '@kinnso/scan'
import type { ExtendedCreator } from '@/lib/creator-mock'

/** One platform's follower count for the identity card (count optional). */
export interface StudioFollower {
  platform: Platform
  count?: number
}

/** Identity surfaced on the Studio Scan header — real or mock-derived. */
export interface StudioIdentity {
  name: string
  handle: string
  avatarInitials: string
  followers: StudioFollower[]
  lastScanned: string // YYYY-MM-DD
}

/** The slice of a `creators` row this module needs. */
export interface CreatorRow {
  display_name: string | null
}

/** The slice of a `creator_social_handles` row this module needs. */
export interface HandleRow {
  platform: Platform
  handle: string
  url?: string | null
}

/** Instagram-first ordering for choosing the primary handle. */
const PLATFORM_PRIORITY: Platform[] = ['instagram', 'youtube', 'threads']

/** 1–2 uppercase letters: first+last initials, else first two letters, else "C". */
export function initialsFrom(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean)
  if (parts.length === 0) return 'C'
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase()
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase()
}

function primaryHandle(handles: HandleRow[]): string | null {
  for (const p of PLATFORM_PRIORITY) {
    const hit = handles.find((h) => h.platform === p)
    if (hit) return hit.handle
  }
  return handles[0]?.handle ?? null
}

/** Real identity from owner-scoped DB rows + validated DNA. */
export function buildStudioIdentity(
  creator: CreatorRow | null,
  handles: HandleRow[],
  dna: Dna,
  updatedAtISO: string,
): StudioIdentity {
  const handle = primaryHandle(handles)
  const name = creator?.display_name?.trim() || handle || 'Creator'
  return {
    name,
    handle: handle ?? name,
    avatarInitials: initialsFrom(name),
    followers: dna.platforms.map((p) => ({ platform: p.platform, count: p.followers })),
    lastScanned: updatedAtISO.slice(0, 10),
  }
}

/** Mock-demo identity from the `ExtendedCreator` overlay. `todayISO` is injected
 *  so this stays pure (no `new Date()` inside). */
export function buildDemoIdentity(c: ExtendedCreator, todayISO: string): StudioIdentity {
  const followers: StudioFollower[] = [
    { platform: 'instagram', count: c.followerIg },
    { platform: 'threads', count: c.followerTh },
  ]
  if (c.followerYt > 0) followers.push({ platform: 'youtube', count: c.followerYt })
  return {
    name: c.name,
    handle: c.handle,
    avatarInitials: initialsFrom(c.name),
    followers,
    lastScanned: todayISO.slice(0, 10),
  }
}
