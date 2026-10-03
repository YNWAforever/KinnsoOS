import { createSupabasePublicClient } from '@/lib/supabase/public'
import type { SearchableCreator } from '@/lib/merchants/relevance'

interface RawProfile { niches?: string[]; audience_geos?: string[]; languages?: string[]; platforms?: { platform: string }[] }

export async function searchPublicCreators(): Promise<SearchableCreator[]> {
  const supabase = createSupabasePublicClient()
  const { data: rows, error } = await supabase
    .from('creators')
    .select('id, handle, display_name, bio, public_profile')
    .eq('status', 'active').not('handle', 'is', null).not('public_profile', 'is', null)
  if (error) throw error
  const creators = rows ?? []
  if (creators.length === 0) return []

  const { data: guideRows } = await supabase
    .from('guides').select('creator_id, published_at').eq('status', 'published')
  const count = new Map<string, number>(); const latest = new Map<string, string>()
  for (const g of guideRows ?? []) {
    count.set(g.creator_id, (count.get(g.creator_id) ?? 0) + 1)
    const cur = latest.get(g.creator_id)
    if (g.published_at && (!cur || g.published_at > cur)) latest.set(g.creator_id, g.published_at)
  }
  return creators.map((c) => {
    const p = (c.public_profile ?? {}) as RawProfile
    return {
      id: c.id as string,
      handle: c.handle as string,
      name: c.display_name ?? (c.handle as string),
      bio: c.bio ?? '',
      niches: p.niches ?? [],
      audienceGeos: p.audience_geos ?? [],
      languages: p.languages ?? [],
      platforms: (p.platforms ?? []).map((x) => x.platform),
      guideCount: count.get(c.id) ?? 0,
      lastGuideAt: latest.get(c.id) ?? null,
    }
  })
}

/** Distinct facet values across the searchable set, for the filter drawer. */
export function deriveFacets(creators: SearchableCreator[]) {
  const u = (xs: string[][]) => [...new Set(xs.flat())].sort()
  return {
    niches: u(creators.map((c) => c.niches)),
    audienceGeos: u(creators.map((c) => c.audienceGeos)),
    languages: u(creators.map((c) => c.languages)),
    platforms: u(creators.map((c) => c.platforms)),
  }
}
