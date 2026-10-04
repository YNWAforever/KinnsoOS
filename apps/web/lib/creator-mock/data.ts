import type { Dna } from '@kinnso/scan'
import type { Guide } from '@/lib/guides/types'
import type {
  Tier,
  TierMetaEntry,
  Creator,
  ExtendedCreator,
  CreatorPost,
  CreatorLocation,
  CreatorPlaceTag,
  EngagementHistoryPoint,
  Mission,
  FeedItem,
} from './types'

// ─── tierMeta (kinnso.ts, verbatim) ───────────────────────────
export const tierMeta: Record<Tier, TierMetaEntry> = {
  seed: { label: 'Seed', scoreMin: 50, payout: 'Affiliate only', commission: '12%', tone: 'bg-kinnso-cream2 text-kinnso-ink' },
  rising: { label: 'Rising', scoreMin: 70, payout: 'HK$50–300 missions', commission: '15%', tone: 'bg-kinnso-amber/30 text-kinnso-ink' },
  pro: { label: 'Pro', scoreMin: 80, payout: 'HK$300–1,200', commission: '18%', tone: 'bg-kinnso-orange/20 text-kinnso-ink' },
  elite: { label: 'Elite', scoreMin: 90, payout: 'Sponsored HK$1k+', commission: '22%', tone: 'bg-kinnso-ink text-white' },
}

// ─── Base creators (kinnso.ts, verbatim) ──────────────────────
export const creators: Creator[] = [
  { handle: 'maywanders', name: 'Maya Wong', homeCity: 'Tokyo', category: 'Coffee', tier: 'pro', score: 88, guides: 27, avatar: 'https://i.pravatar.cc/120?img=47' },
  { handle: 'nomadleo', name: 'Leo Tan', homeCity: 'Bangkok', category: 'Hotels', tier: 'elite', score: 92, guides: 41, avatar: 'https://i.pravatar.cc/120?img=12' },
  { handle: 'aubreyeats', name: 'Aubrey Lim', homeCity: 'Taipei', category: 'Food', tier: 'rising', score: 76, guides: 18, avatar: 'https://i.pravatar.cc/120?img=32' },
  { handle: 'kenjishoots', name: 'Kenji Park', homeCity: 'Seoul', category: 'Photography', tier: 'pro', score: 84, guides: 22, avatar: 'https://i.pravatar.cc/120?img=14' },
  { handle: 'saraonfoot', name: 'Sara Chen', homeCity: 'Hong Kong', category: 'City Walk', tier: 'rising', score: 73, guides: 15, avatar: 'https://i.pravatar.cc/120?img=23' },
  { handle: 'voyagewithem', name: 'Emma Khoo', homeCity: 'Singapore', category: 'Family', tier: 'rising', score: 71, guides: 12, avatar: 'https://i.pravatar.cc/120?img=44' },
]

// ─── ExtendedCreator builder helpers (creatorProfile.ts, verbatim) ──
const BANNERS: Record<string, string> = {
  maywanders: 'https://images.unsplash.com/photo-1490806843957-31f4c9a91c65?q=80&w=2000&auto=format&fit=crop',
  nomadleo: 'https://images.unsplash.com/photo-1508009603885-50cf7c579365?q=80&w=2000&auto=format&fit=crop',
  aubreyeats: 'https://images.unsplash.com/photo-1504674900247-0877df9cc836?q=80&w=2000&auto=format&fit=crop',
  kenjishoots: 'https://images.unsplash.com/photo-1538485399081-7191377e8241?q=80&w=2000&auto=format&fit=crop',
  saraonfoot: 'https://images.unsplash.com/photo-1536599018102-9f803c140fc1?q=80&w=2000&auto=format&fit=crop',
  voyagewithem: 'https://images.unsplash.com/photo-1525625293386-3f8f99389edd?q=80&w=2000&auto=format&fit=crop',
}

const BIOS: Record<string, string> = {
  maywanders: 'Quiet roasters, slow neighborhoods, soft mornings. Tokyo on foot.',
  nomadleo: 'Rooftops, river markets, and the best B-grade hotels in SE Asia.',
  aubreyeats: 'Night markets and cheap eats. Taipei first, the world second.',
  kenjishoots: '35mm photo walks through Seoul, Tokyo, and points east.',
  saraonfoot: 'Hong Kong slow days. Trams, tea, sunsets.',
  voyagewithem: 'Family travel without the meltdowns.',
}

const CONTENT_COLORS = ['hsl(var(--k-orange))', 'hsl(var(--k-amber))', 'hsl(var(--k-blue))', 'hsl(var(--k-green))', 'hsl(var(--k-muted))']

const MIXES: Record<string, { tag: string; pct: number }[]> = {
  maywanders: [{ tag: 'Coffee', pct: 38 }, { tag: 'City Walk', pct: 24 }, { tag: 'Food', pct: 20 }, { tag: 'Hotels', pct: 12 }, { tag: 'Other', pct: 6 }],
  nomadleo: [{ tag: 'Hotels', pct: 44 }, { tag: 'Food', pct: 22 }, { tag: 'City Walk', pct: 18 }, { tag: 'Wellness', pct: 10 }, { tag: 'Other', pct: 6 }],
  aubreyeats: [{ tag: 'Food', pct: 52 }, { tag: 'Markets', pct: 22 }, { tag: 'City Walk', pct: 14 }, { tag: 'Coffee', pct: 8 }, { tag: 'Other', pct: 4 }],
  kenjishoots: [{ tag: 'Photography', pct: 46 }, { tag: 'City Walk', pct: 24 }, { tag: 'Coffee', pct: 14 }, { tag: 'Food', pct: 10 }, { tag: 'Other', pct: 6 }],
  saraonfoot: [{ tag: 'City Walk', pct: 40 }, { tag: 'Food', pct: 24 }, { tag: 'Coffee', pct: 18 }, { tag: 'Hotels', pct: 10 }, { tag: 'Other', pct: 8 }],
  voyagewithem: [{ tag: 'Family', pct: 48 }, { tag: 'Hotels', pct: 22 }, { tag: 'Activities', pct: 16 }, { tag: 'Food', pct: 10 }, { tag: 'Other', pct: 4 }],
}

const TAG_CLOUDS: Record<string, string[]> = {
  maywanders: ['tokyo', 'shibuya', 'coffee', 'matcha', 'slowmornings', 'kyoto', 'jazzkissa', 'hkcoffee'],
  nomadleo: ['bangkok', 'rooftop', 'hotelreview', 'streetfood', 'singapore', 'kualalumpur', 'poolside', 'spa'],
  aubreyeats: ['taipei', 'nightmarket', 'beefnoodle', 'bubbletea', 'shilin', 'ximen', 'streetfood', 'cheapeats'],
  kenjishoots: ['seoul', 'seongsu', 'film', '35mm', 'tokyo', 'portra', 'ricoh', 'streetphoto'],
  saraonfoot: ['hongkong', 'ding', 'tram', 'cha', 'sunset', 'centralwalk', 'cheungchau', 'slowday'],
  voyagewithem: ['singapore', 'kidsfriendly', 'gardens', 'sentosa', 'poolside', 'stroller', 'familytravel', 'hk'],
}

const AUDIENCES: Record<string, { hk: number; tw: number; sg: number; other: number }> = {
  maywanders: { hk: 41, tw: 22, sg: 11, other: 26 },
  nomadleo: { hk: 24, tw: 18, sg: 32, other: 26 },
  aubreyeats: { hk: 28, tw: 44, sg: 10, other: 18 },
  kenjishoots: { hk: 30, tw: 18, sg: 12, other: 40 },
  saraonfoot: { hk: 62, tw: 12, sg: 10, other: 16 },
  voyagewithem: { hk: 18, tw: 12, sg: 48, other: 22 },
}

const FOLLOWERS: Record<string, [number, number, number]> = {
  maywanders: [27400, 8200, 3100],
  nomadleo: [62300, 14100, 22400],
  aubreyeats: [18200, 4100, 0],
  kenjishoots: [33100, 6200, 8900],
  saraonfoot: [12400, 3200, 0],
  voyagewithem: [9800, 2100, 0],
}

// KEPT for studio-scan (out of scope this phase) — getCreator() below finds() into this for app/[locale]/studio/scan/page.tsx's `metrics`. Do not delete without checking that surface first.
export const extendedCreators: ExtendedCreator[] = creators.map((c) => {
  const [ig, th, yt] = FOLLOWERS[c.handle] ?? [10000, 2000, 0]
  const totalReach = ig + th + yt
  const aud = AUDIENCES[c.handle] ?? { hk: 25, tw: 25, sg: 25, other: 25 }
  const primary = Object.entries(aud).sort((a, b) => b[1] - a[1])[0] as ['hk' | 'tw' | 'sg' | 'other', number]
  const primaryCountry = primary[0] === 'other' ? 'Other' : (primary[0].toUpperCase() as 'HK' | 'TW' | 'SG')
  const mixRaw = MIXES[c.handle] ?? MIXES.maywanders
  return {
    ...c,
    bio: BIOS[c.handle] ?? 'Travel creator.',
    banner: BANNERS[c.handle] ?? BANNERS.maywanders,
    followerIg: ig,
    followerTh: th,
    followerYt: yt,
    totalReach,
    driven90dReach: Math.round(totalReach * 7.2), // 7.2 is a mock multiplier only — not derived from real data
    drivenGmv: Math.round(c.score * 520),
    countries: 8 + (c.score % 7),
    cities: 22 + (c.score % 20),
    contentMix: mixRaw.map((m, i) => ({ ...m, color: CONTENT_COLORS[i] })),
    audience: aud,
    topTags: (TAG_CLOUDS[c.handle] ?? []).map((t, i, arr) => ({ tag: t, weight: 1 - i / arr.length })),
    primaryAudienceCountry: primaryCountry,
    primaryAudiencePct: primary[1],
    er: 0.04 + (c.score / 100) * 0.06,
    lastPostedAt: ['2026-06-13', '2026-06-12', '2026-06-10', '2026-06-09', '2026-06-08', '2026-06-05'][creators.indexOf(c) % 6],
  }
})

// ─── Locations (creatorProfile.ts, verbatim) ──────────────────
const CITY_LIBRARY: Record<string, { country: string; countryName: string; flag: string; lat: number; lon: number }> = {
  Tokyo: { country: 'JP', countryName: 'Japan', flag: '🇯🇵', lat: 35.6762, lon: 139.6503 },
  Kyoto: { country: 'JP', countryName: 'Japan', flag: '🇯🇵', lat: 35.0116, lon: 135.7681 },
  Osaka: { country: 'JP', countryName: 'Japan', flag: '🇯🇵', lat: 34.6937, lon: 135.5023 },
  Fukuoka: { country: 'JP', countryName: 'Japan', flag: '🇯🇵', lat: 33.5904, lon: 130.4017 },
  Taipei: { country: 'TW', countryName: 'Taiwan', flag: '🇹🇼', lat: 25.033, lon: 121.5654 },
  Tainan: { country: 'TW', countryName: 'Taiwan', flag: '🇹🇼', lat: 22.9999, lon: 120.227 },
  Bangkok: { country: 'TH', countryName: 'Thailand', flag: '🇹🇭', lat: 13.7563, lon: 100.5018 },
  ChiangMai: { country: 'TH', countryName: 'Thailand', flag: '🇹🇭', lat: 18.7883, lon: 98.9853 },
  Seoul: { country: 'KR', countryName: 'Korea', flag: '🇰🇷', lat: 37.5665, lon: 126.978 },
  Busan: { country: 'KR', countryName: 'Korea', flag: '🇰🇷', lat: 35.1796, lon: 129.0756 },
  'Hong Kong': { country: 'HK', countryName: 'Hong Kong', flag: '🇭🇰', lat: 22.3193, lon: 114.1694 },
  Singapore: { country: 'SG', countryName: 'Singapore', flag: '🇸🇬', lat: 1.3521, lon: 103.8198 },
  Bali: { country: 'ID', countryName: 'Indonesia', flag: '🇮🇩', lat: -8.3405, lon: 115.092 },
  Hanoi: { country: 'VN', countryName: 'Vietnam', flag: '🇻🇳', lat: 21.0285, lon: 105.8542 },
}

const LOCATION_MAP: Record<string, { city: string; postCount: number }[]> = {
  maywanders: [{ city: 'Tokyo', postCount: 17 }, { city: 'Kyoto', postCount: 11 }, { city: 'Osaka', postCount: 7 }, { city: 'Hong Kong', postCount: 9 }, { city: 'Taipei', postCount: 5 }, { city: 'Fukuoka', postCount: 3 }],
  nomadleo: [{ city: 'Bangkok', postCount: 24 }, { city: 'Singapore', postCount: 14 }, { city: 'Hong Kong', postCount: 8 }, { city: 'ChiangMai', postCount: 6 }, { city: 'Bali', postCount: 5 }, { city: 'Hanoi', postCount: 4 }],
  aubreyeats: [{ city: 'Taipei', postCount: 22 }, { city: 'Tainan', postCount: 8 }, { city: 'Hong Kong', postCount: 6 }, { city: 'Tokyo', postCount: 5 }, { city: 'Bangkok', postCount: 3 }],
  kenjishoots: [{ city: 'Seoul', postCount: 19 }, { city: 'Busan', postCount: 7 }, { city: 'Tokyo', postCount: 11 }, { city: 'Kyoto', postCount: 5 }, { city: 'Hong Kong', postCount: 4 }],
  saraonfoot: [{ city: 'Hong Kong', postCount: 28 }, { city: 'Tokyo', postCount: 6 }, { city: 'Taipei', postCount: 5 }, { city: 'Singapore', postCount: 4 }],
  voyagewithem: [{ city: 'Singapore', postCount: 18 }, { city: 'Hong Kong', postCount: 7 }, { city: 'Bali', postCount: 5 }, { city: 'Tokyo', postCount: 4 }, { city: 'Bangkok', postCount: 3 }],
}

export const creatorLocations: CreatorLocation[] = Object.entries(LOCATION_MAP).flatMap(([handle, list]) =>
  list.map((r) => {
    const meta = CITY_LIBRARY[r.city]!
    return {
      creatorHandle: handle,
      city: r.city.includes(' ') ? r.city : r.city.replace(/([A-Z])/g, ' $1').trim(),
      country: meta.country,
      countryName: meta.countryName,
      flag: meta.flag,
      lat: meta.lat,
      lon: meta.lon,
      postCount: r.postCount,
      firstVisited: '2024-03-12',
      lastVisited: '2026-06-08',
    }
  }),
)

// ─── Place tags (creatorProfile.ts, representative subset) ─────
export const creatorPlaceTags: CreatorPlaceTag[] = [
  { creatorHandle: 'maywanders', placeName: 'Fuglen Tokyo', placeType: 'cafe', city: 'Tokyo', country: 'JP', source: 'geotag', visitCount: 5, totalEngagement: 22400 },
  { creatorHandle: 'maywanders', placeName: 'Hoshinoya Kyoto', placeType: 'hotel', city: 'Kyoto', country: 'JP', source: 'caption_ner', visitCount: 2, totalEngagement: 8900 },
  { creatorHandle: 'maywanders', placeName: 'Fushimi Inari', placeType: 'attraction', city: 'Kyoto', country: 'JP', source: 'vision', visitCount: 3, totalEngagement: 12400 },
  { creatorHandle: 'maywanders', placeName: 'Shibuya Crossing', placeType: 'neighbourhood', city: 'Tokyo', country: 'JP', source: 'geotag', visitCount: 4, totalEngagement: 18100 },
  { creatorHandle: 'nomadleo', placeName: 'Sirocco Sky Bar', placeType: 'restaurant', city: 'Bangkok', country: 'TH', source: 'geotag', visitCount: 3, totalEngagement: 19800 },
  { creatorHandle: 'nomadleo', placeName: 'Marina Bay Sands', placeType: 'hotel', city: 'Singapore', country: 'SG', source: 'vision', visitCount: 2, totalEngagement: 14200 },
  { creatorHandle: 'aubreyeats', placeName: 'Shilin Night Market', placeType: 'attraction', city: 'Taipei', country: 'TW', source: 'geotag', visitCount: 6, totalEngagement: 24100 },
  { creatorHandle: 'aubreyeats', placeName: 'Yong Kang Beef Noodle', placeType: 'restaurant', city: 'Taipei', country: 'TW', source: 'caption_ner', visitCount: 4, totalEngagement: 16800 },
  { creatorHandle: 'kenjishoots', placeName: 'Seongsu-dong', placeType: 'neighbourhood', city: 'Seoul', country: 'KR', source: 'geotag', visitCount: 5, totalEngagement: 21000 },
  { creatorHandle: 'kenjishoots', placeName: 'Onion Anguk', placeType: 'cafe', city: 'Seoul', country: 'KR', source: 'vision', visitCount: 3, totalEngagement: 12400 },
  { creatorHandle: 'saraonfoot', placeName: 'Star Ferry', placeType: 'attraction', city: 'Hong Kong', country: 'HK', source: 'vision', visitCount: 7, totalEngagement: 18900 },
  { creatorHandle: 'saraonfoot', placeName: 'Tai Cheong Bakery', placeType: 'cafe', city: 'Hong Kong', country: 'HK', source: 'caption_ner', visitCount: 4, totalEngagement: 9100 },
  { creatorHandle: 'voyagewithem', placeName: 'Gardens by the Bay', placeType: 'attraction', city: 'Singapore', country: 'SG', source: 'geotag', visitCount: 4, totalEngagement: 11400 },
  { creatorHandle: 'voyagewithem', placeName: 'Capella Sentosa', placeType: 'hotel', city: 'Singapore', country: 'SG', source: 'vision', visitCount: 2, totalEngagement: 8200 },
]

// ─── Engagement history (creatorProfile.ts, verbatim) ─────────
const HISTORY_MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun']
export const engagementHistory: EngagementHistoryPoint[] = extendedCreators.flatMap((c) =>
  HISTORY_MONTHS.map((m, i) => ({
    creatorHandle: c.handle,
    month: m,
    dnaScore: Math.max(40, Math.min(99, c.score - 6 + i + ((i * 17 + c.handle.length) % 5) - 2)),
    er: Math.max(0.03, Math.min(0.11, c.er + (i - 3) * 0.004 + ((i * 13) % 4) * 0.002)),
    posts: 24 + ((i * 7 + c.handle.length) % 14),
  })),
)

// ─── Posts (creatorProfile.ts, verbatim builder) ──────────────
const POST_THUMBS = [
  'https://images.unsplash.com/photo-1453614512568-c4024d13c247?q=80&w=600&auto=format&fit=crop',
  'https://images.unsplash.com/photo-1508009603885-50cf7c579365?q=80&w=600&auto=format&fit=crop',
  'https://images.unsplash.com/photo-1551516594-56cb78394645?q=80&w=600&auto=format&fit=crop',
  'https://images.unsplash.com/photo-1538485399081-7191377e8241?q=80&w=600&auto=format&fit=crop',
  'https://images.unsplash.com/photo-1536599018102-9f803c140fc1?q=80&w=600&auto=format&fit=crop',
  'https://images.unsplash.com/photo-1525625293386-3f8f99389edd?q=80&w=600&auto=format&fit=crop',
  'https://images.unsplash.com/photo-1490806843957-31f4c9a91c65?q=80&w=600&auto=format&fit=crop',
  'https://images.unsplash.com/photo-1504674900247-0877df9cc836?q=80&w=600&auto=format&fit=crop',
  'https://images.unsplash.com/photo-1496442226666-8d4d0e62e6e9?q=80&w=600&auto=format&fit=crop',
  'https://images.unsplash.com/photo-1542052125323-e69ad37a47c4?q=80&w=600&auto=format&fit=crop',
  'https://images.unsplash.com/photo-1517248135467-4c7edcad34c4?q=80&w=600&auto=format&fit=crop',
  'https://images.unsplash.com/photo-1528127269322-539801943592?q=80&w=600&auto=format&fit=crop',
]
const PLATFORMS: Array<CreatorPost['platform']> = ['instagram', 'instagram', 'threads', 'youtube']
const CAPTIONS = [
  'Quiet morning at the roastery — 7am light hits different.',
  'This little place changed my whole afternoon.',
  'Ducked into this spot off the main strip — worth it.',
  'Best HK$80 noodle bowl in the city, no contest.',
  'Sunset from the rooftop. Couldn\'t put the camera down.',
  'Tiny detour, huge payoff.',
]

export const creatorPosts: CreatorPost[] = extendedCreators.flatMap((c) => {
  const locs = creatorLocations.filter((l) => l.creatorHandle === c.handle)
  const tags = creatorPlaceTags.filter((t) => t.creatorHandle === c.handle)
  return Array.from({ length: 24 }, (_, i) => {
    const loc = locs[i % Math.max(1, locs.length)]
    const tag = tags[i % Math.max(1, tags.length)]
    const isTravel = i % 5 !== 0
    const base = c.score * 50 + i * 37
    return {
      id: `${c.handle}-p${i}`,
      creatorHandle: c.handle,
      platform: PLATFORMS[i % PLATFORMS.length],
      postUrl: 'https://instagram.com',
      thumbnail: POST_THUMBS[(i + c.handle.length) % POST_THUMBS.length],
      caption: CAPTIONS[i % CAPTIONS.length],
      postedAt: `2026-0${6 - (i % 6)}-${String(28 - i).padStart(2, '0')}`,
      likes: base + 800,
      comments: Math.round(base / 22) + 18,
      saves: Math.round(base / 6) + 60,
      views: base * 12 + 9000,
      isTravel,
      city: isTravel ? loc?.city : undefined,
      placeName: isTravel ? tag?.placeName : undefined,
    }
  })
})

// ─── Missions (kinnso.ts, representative subset) ──────────────
// KEPT for studio-scan (out of scope this phase) — StudioScanView.tsx:110 does `missions.slice(0, 3)` directly. Do not delete without checking that surface first.
export const missions: Mission[] = [
  { id: 'm_001', merchant: 'Hoshino Resorts', category: 'Hotel', title: 'OMO5 Tokyo Otsuka — 2-night stay + Guide', brief: 'Stay 2 nights at OMO5 and publish a Tokyo neighborhood Guide featuring the property and 5 nearby stops.', cities: ['Tokyo'], tier: 'pro', payout: 1200, commission: 6, travelWindow: 'Jul 1–31, 2026', deadline: 'Aug 15, 2026', status: 'open' },
  { id: 'm_002', merchant: 'Klook', category: 'Activity', title: 'Bangkok Floating Market half-day tour', brief: 'Book the Damnoen Saduak tour, publish a Guide segment with photo/video and tracked affiliate link.', cities: ['Bangkok'], tier: 'rising', payout: 280, commission: 8, travelWindow: 'Jun 15–Jul 31', deadline: 'Aug 1, 2026', status: 'open' },
  { id: 'm_004', merchant: 'Mandarin Oriental', category: 'Hotel', title: 'MO Taipei — Wellness weekender Guide', brief: 'Comped 1-night spa stay + dinner. Publish a wellness-angled Guide for Taipei.', cities: ['Taipei'], tier: 'elite', payout: 2400, commission: 5, travelWindow: 'Aug 1–31, 2026', deadline: 'Sep 15, 2026', status: 'open' },
]

// Merchant logo wall for the homepage "Trusted by partners" strip (mock).
export const merchantLogos: string[] = [
  'Cathay', 'Klook', 'agoda', 'Trip.com', 'KKday', 'EVA Air', 'Shangri-La', 'Muji',
]

// ─── DNA sample — REAL @kinnso/scan `Dna` (unified source of truth).
// Replaces the redesign's flat `sampleDna`; its numeric/audience data lives
// in the metrics overlay (extendedCreators) instead.
export const sampleDna: Dna = {
  bio: 'Quiet roasters, slow neighborhoods, soft mornings. Tokyo on foot.',
  niches: ['Coffee', 'City Walk', 'Slow travel'],
  content_pillars: ['Specialty cafés', 'Neighborhood walks', 'Morning routines'],
  tone: ['calm', 'observant', 'warm'],
  audience: {
    top_geos: ['HK', 'TW', 'SG'],
    top_locales: ['zh-HK', 'zh-TW', 'en'],
  },
  platforms: [
    { platform: 'instagram', followers: 27400, avg_engagement: 0.062, verified: false },
    { platform: 'threads', followers: 8200, avg_engagement: 0.041, verified: false },
    { platform: 'youtube', followers: 3100, avg_engagement: 0.028, verified: false },
  ],
  languages: ['en', 'zh-HK', 'ja'],
}

// ─── Guides (kinnso.ts, cross-phase reconciliation) ───────────
// Phase 2A GuideCard and Phase 4 CreatorProfileView import from here.
// Lifted from redesign-kinnso-layout-only/src/mocks/kinnso.ts, projected
// onto the slimmer Guide interface (slug/title/cover/city/saves/creatorHandle).
export const guides: Guide[] = [
  { slug: 'shibuya-coffee-crawl', title: 'Shibuya Coffee Crawl: 7 Quiet Roasters in 1 Afternoon', cover: 'https://images.unsplash.com/photo-1453614512568-c4024d13c247?q=80&w=1600&auto=format&fit=crop', city: 'Tokyo', saves: 1240, creatorHandle: 'maywanders' },
  { slug: 'bangkok-rooftop-72h', title: 'Bangkok in 72 Hours: Rooftops, Markets, Massage', cover: 'https://images.unsplash.com/photo-1508009603885-50cf7c579365?q=80&w=1600&auto=format&fit=crop', city: 'Bangkok', saves: 2380, creatorHandle: 'nomadleo' },
  { slug: 'taipei-nightmarket', title: 'Taipei Night-Market Loop: 11 Bites Under HK$200', cover: 'https://images.unsplash.com/photo-1551516594-56cb78394645?q=80&w=1600&auto=format&fit=crop', city: 'Taipei', saves: 980, creatorHandle: 'aubreyeats' },
  { slug: 'seoul-frame-by-frame', title: 'Seoul, Frame by Frame: A Photo Walk in Seongsu', cover: 'https://images.unsplash.com/photo-1538485399081-7191377e8241?q=80&w=1600&auto=format&fit=crop', city: 'Seoul', saves: 1410, creatorHandle: 'kenjishoots' },
  { slug: 'hk-island-slow-day', title: 'Hong Kong Island, Slow Day: Tram, Tea, Sunset', cover: 'https://images.unsplash.com/photo-1536599018102-9f803c140fc1?q=80&w=1600&auto=format&fit=crop', city: 'Hong Kong', saves: 670, creatorHandle: 'saraonfoot' },
  { slug: 'singapore-family-3day', title: 'Singapore with Kids: 3 Days, Zero Meltdowns', cover: 'https://images.unsplash.com/photo-1525625293386-3f8f99389edd?q=80&w=1600&auto=format&fit=crop', city: 'Singapore', saves: 510, creatorHandle: 'voyagewithem' },
]

// ─── Feed items (travelers feed, Slice 3b) ────────────────────
export const feedItems: FeedItem[] = [
  { id: 'f1', creatorHandle: '@maywanders', creatorName: 'May', avatar: 'https://i.pravatar.cc/100?img=47', image: 'https://images.unsplash.com/photo-1503899036084-c55cdd92da26?q=80&w=1200&auto=format&fit=crop', caption: 'Sunset ramen crawl in Sham Shui Po', city: 'Hong Kong', saves: 1280, postedAgo: '2h' },
  { id: 'f2', creatorHandle: '@nomadleo', creatorName: 'Leo', avatar: 'https://i.pravatar.cc/100?img=12', image: 'https://images.unsplash.com/photo-1492571350019-22de08371fd3?q=80&w=1200&auto=format&fit=crop', caption: 'Hidden coffee lanes in Daikanyama', city: 'Tokyo', saves: 980, postedAgo: '5h' },
  { id: 'f3', creatorHandle: '@aubreyeats', creatorName: 'Aubrey', avatar: 'https://i.pravatar.cc/100?img=32', image: 'https://images.unsplash.com/photo-1467003909585-2f8a72700288?q=80&w=1200&auto=format&fit=crop', caption: 'Best night-market bites in Taipei', city: 'Taipei', saves: 1543, postedAgo: '8h' },
  { id: 'f4', creatorHandle: '@seoulsearch', creatorName: 'Jin', avatar: 'https://i.pravatar.cc/100?img=5', image: 'https://images.unsplash.com/photo-1517154421773-0529f29ea451?q=80&w=1200&auto=format&fit=crop', caption: 'Hanok stays worth the splurge', city: 'Seoul', saves: 760, postedAgo: '12h' },
  { id: 'f5', creatorHandle: '@bangkokbites', creatorName: 'Nok', avatar: 'https://i.pravatar.cc/100?img=20', image: 'https://images.unsplash.com/photo-1528181304800-259b08848526?q=80&w=1200&auto=format&fit=crop', caption: 'Boat-noodle route along the canals', city: 'Bangkok', saves: 1120, postedAgo: '1d' },
  { id: 'f6', creatorHandle: '@maywanders', creatorName: 'May', avatar: 'https://i.pravatar.cc/100?img=47', image: 'https://images.unsplash.com/photo-1535139262971-c51845709a48?q=80&w=1200&auto=format&fit=crop', caption: 'A perfect rainy-day cafe in Sheung Wan', city: 'Hong Kong', saves: 845, postedAgo: '1d' },
]
