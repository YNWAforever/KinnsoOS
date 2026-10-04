import type { LegacySource } from '../types'

// Baseline expected from kinnso-v3/supabase/seed.sql (the live deploy serves these fixtures).
// Used when neither --legacy-sitemap nor --legacy-mysql is supplied (this environment).
// ⚠️ If the hosted dev read-model is cleaned before production, these fixtures (especially the
//    negative + redirect rows) must stay in seed.sql, or update this file alongside it.

export const EXPECTED_DETAIL_PATHS: readonly string[] = [
  '/en/articles/dining/ramen-guide',
  '/zh-hk/articles/dining/ramen-guide',
  '/en/articles/dining/sushi-guide',
  '/en/articles/dining/cafe-guide',
  '/en/articles/dining/pub-article',
  '/zh-hk/articles/dining/pub-article',
  '/en/articles/shopping/mall-coupon',
  '/zh-hk/articles/shopping/mall-coupon',
]

export const EXPECTED_LOCALE_COUNTS: Readonly<Record<string, number>> = { en: 5, 'zh-hk': 3 }

// from_path is locale-agnostic; the proxy redirects to /{locale ?? 'en'}{to_path} at 301.
export const EXPECTED_REDIRECTS: ReadonlyArray<{ from: string; to: string }> = [
  { from: '/post/old-ramen', to: '/en/articles/dining/ramen-guide' },
  { from: '/zh-hk/post/old-ramen', to: '/zh-hk/articles/dining/ramen-guide' },
]

export const EXPECTED_NEGATIVE_PATHS: readonly string[] = [
  '/en/articles/shopping/draft-article', // published_at null
  '/en/articles/destinations/expired-article', // end_at past (note plural segment)
  '/ja/articles/dining/ramen-guide', // valid locale, missing translation
]

export function createFixtureLegacySource(): LegacySource {
  return {
    async expectedUrlPaths() {
      return new Set(EXPECTED_DETAIL_PATHS)
    },
    async localeCounts() {
      return { ...EXPECTED_LOCALE_COUNTS }
    },
    async redirectSamples() {
      return EXPECTED_REDIRECTS.map((r) => ({ ...r }))
    },
    async negativePaths() {
      return [...EXPECTED_NEGATIVE_PATHS]
    },
  }
}
