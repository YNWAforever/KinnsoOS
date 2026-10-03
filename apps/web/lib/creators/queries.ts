import { isDirectoryListed } from '@/lib/creators/eligibility'
import { createSupabasePublicClient } from '@/lib/supabase/public'
import { mapRowToGuide } from '@/lib/guides/queries'
import type { Guide } from '@/lib/guides/types'

export interface PublicProfile {
  niches: string[]
  content_pillars: string[]
  tone: string[]
  audience_geos: string[]
  audience_locales: string[]
  languages: string[]
  platforms: PublicCreatorPlatform[]
}

export interface PublicCreatorPlatform {
  platform: string
  verified: boolean
  followers?: number
}

export interface CreatorSummary {
  handle: string
  name: string
  bio: string
  niches: string[]
  guideCount: number
}

export interface PublicCreator {
  handle: string
  id: string
  name: string
  bio: string
  profile: PublicProfile
  avatarUrl: string | null
  guides: Guide[]
}

export function toProfile(json: unknown): PublicProfile {
  const j = (json ?? {}) as Partial<PublicProfile>
  const platforms = Array.isArray(j.platforms) ? j.platforms.flatMap((value) => {
    if (!value || typeof value !== 'object') return []
    const platform = value as Partial<PublicCreatorPlatform>
    if (typeof platform.platform !== 'string') return []
    const followers = typeof platform.followers === 'number' && Number.isFinite(platform.followers) && platform.followers >= 0
      ? { followers: platform.followers }
      : {}
    return [{ platform: platform.platform, verified: platform.verified === true, ...followers }]
  }) : []
  return {
    niches: j.niches ?? [],
    content_pillars: j.content_pillars ?? [],
    tone: j.tone ?? [],
    audience_geos: j.audience_geos ?? [],
    audience_locales: j.audience_locales ?? [],
    languages: j.languages ?? [],
    platforms,
  }
}

export interface EligibleCreatorRow {
  id: string
  isListed: boolean
  handle: string
  displayName: string | null
  bio: string | null
  publicProfile: unknown
  createdAt: string | null
  guideCount: number
}

/** Shared directory/sitemap eligibility: an active public creator is discoverable when
 * they have a published guide or ops has explicitly enabled the listing override. */
export async function fetchEligibleCreators(): Promise<EligibleCreatorRow[]> {
  const supabase = createSupabasePublicClient()
  const { data: creatorRows } = await supabase
    .from('creators')
    .select('id, is_listed, handle, display_name, bio, public_profile, created_at')
    .eq('status', 'active')
    .not('handle', 'is', null)
    .not('public_profile', 'is', null)
    .order('created_at', { ascending: false })
    .order('handle')
  if (!creatorRows?.length) return []

  const { data: guideRows } = await supabase
    .from('guides')
    .select('creator_id')
    .eq('status', 'published')
  const counts = new Map<string, number>()
  for (const guide of guideRows ?? []) {
    counts.set(guide.creator_id, (counts.get(guide.creator_id) ?? 0) + 1)
  }

  return creatorRows
    .map((creator) => ({
      id: creator.id,
      isListed: creator.is_listed,
      handle: creator.handle as string,
      displayName: creator.display_name,
      bio: creator.bio,
      publicProfile: creator.public_profile,
      createdAt: creator.created_at,
      guideCount: counts.get(creator.id) ?? 0,
    }))
    // Shared with the studio readiness checklist so the directory rule has one
    // definition. `status`, `handle` and `public_profile` are already enforced by
    // the query above; passing them keeps the predicate whole rather than split
    // across two places.
    .filter((creator) =>
      isDirectoryListed({
        status: 'active',
        handle: creator.handle,
        publicProfile: creator.publicProfile,
        publishedGuideCount: creator.guideCount,
        isListed: creator.isListed,
      }),
    )
}

export async function getPublicCreators(): Promise<CreatorSummary[]> {
  const creators = await fetchEligibleCreators()
  return creators.map((c) => ({
    handle: c.handle,
    name: c.displayName ?? c.handle,
    bio: c.bio ?? '',
    niches: toProfile(c.publicProfile).niches,
    guideCount: c.guideCount,
  }))
}

// Intentionally broader than `fetchEligibleCreators` (active only, no public_profile
// requirement): a profile renders by direct URL even if it isn't in the directory/sitemap.
// Since the listable predicate implies status='active', the sitemap stays a subset of
// renderable pages — see fetchEligibleCreators.
function isMissingCreatorAvatarColumn(error: unknown): boolean {
  if (!error || typeof error !== 'object') return false
  const candidate = error as { code?: unknown; message?: unknown }
  return candidate.code === '42703' &&
    typeof candidate.message === 'string' &&
    candidate.message.includes('creators.avatar_url')
}

export async function getCreatorByHandle(handle: string): Promise<PublicCreator | null> {
  const supabase = createSupabasePublicClient()
  const primary = await supabase
    .from('creators')
    .select('id, handle, display_name, bio, avatar_url, public_profile')
    .eq('handle', handle)
    .eq('status', 'active')
    .maybeSingle()
  let c = primary.data
  let error = primary.error

  // Preview and production can briefly lag the R7.7 avatar migration. Preserve the
  // public profile with no avatar, but keep every unrelated database error visible.
  if (isMissingCreatorAvatarColumn(error)) {
    const fallback = await supabase
      .from('creators')
      .select('id, handle, display_name, bio, public_profile')
      .eq('handle', handle)
      .eq('status', 'active')
      .maybeSingle()
    c = fallback.data ? { ...fallback.data, avatar_url: null } : null
    error = fallback.error
  }

  if (error) throw error
  if (!c) return null

  return {
    handle: c.handle as string,
    id: c.id,
    avatarUrl: c.avatar_url,
    name: c.display_name ?? (c.handle as string),
    bio: c.bio ?? '',
    profile: toProfile(c.public_profile),
    guides: [],
  }
}

export async function getPublishedGuidesForCreator(creatorId: string): Promise<Guide[]> {
  const supabase = createSupabasePublicClient()
  const { data, error } = await supabase
    .from('guides')
    .select('slug, title, cover_url, city, saves_count, creator_handle')
    .eq('creator_id', creatorId)
    .eq('status', 'published')
    .order('published_at', { ascending: false })
  if (error) throw error
  return (data ?? []).map(mapRowToGuide)
}

export async function getCreatorsForSitemap(): Promise<{ handle: string; lastmod: string | null }[]> {
  const rows = await fetchEligibleCreators()
  return rows.map((r) => ({
    handle: r.handle,
    lastmod: r.createdAt,
  }))
}

export interface CreatorPublicName {
  name: string
  handle: string | null
}

export async function getCreatorPublicNames(
  ids: string[],
): Promise<Map<string, CreatorPublicName>> {
  const unique = [...new Set(ids.filter(Boolean))]
  const map = new Map<string, CreatorPublicName>()
  if (unique.length === 0) return map

  const supabase = createSupabasePublicClient()
  const { data } = await supabase
    .from('creators')
    .select('id, handle, display_name')
    .in('id', unique)

  for (const c of data ?? []) {
    const handle = (c.handle as string | null) ?? null
    const name = (c.display_name ?? handle) as string
    if (name) map.set(c.id as string, { name, handle })
  }
  return map
}
