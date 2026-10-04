import type { MetadataRoute } from 'next'
import { getPublishedForSitemap } from '@/lib/articles/queries'
import { getGuidesForSitemap } from '@/lib/guides/queries'
import { getCreatorsForSitemap } from '@/lib/creators/queries'
import { getMerchantsForSitemap } from '@/lib/merchants/public-queries'
import { getExperiencesForSitemap } from '@/lib/experiences/public-queries'
import { getSessionsForSitemap } from '@/lib/sessions/public-queries'
import { getDestinationsForSitemap } from '@/lib/destinations/queries'
import { LOCALES, URL_CATEGORIES, toUrlCategory } from '@/lib/i18n/config'
import { SITE_URL } from '@/lib/seo/metadata'
import { MARKETING_PATHS } from '@/lib/seo/routes'

export const revalidate = 21600 // 6h

// The sitemap protocol caps a single file at 50,000 URLs / 50 MB. Because guides and
// creators each fan out across every locale, the URL count grows fast, so we shard well
// under the cap and let Next emit a sitemap index (/sitemap.xml) over /sitemap/<id>.xml
// instead of silently overflowing one file.
const SITEMAP_CHUNK = 40000

/** The full, deterministically-ordered URL set. Stable order matters: generateSitemaps
 *  and each sitemap({id}) call must partition the SAME sequence or shards would overlap
 *  or drop URLs. */
async function buildAllSitemapEntries(): Promise<MetadataRoute.Sitemap> {
  const [articles, guides, creators, merchants, experiences, sessions, destinations] = await Promise.all([
    getPublishedForSitemap(), getGuidesForSitemap(), getCreatorsForSitemap(),
    getMerchantsForSitemap(), getExperiencesForSitemap(), getSessionsForSitemap(), getDestinationsForSitemap(),
  ])
  const out: MetadataRoute.Sitemap = []

  const populatedArticleCategories = new Set<string>()
  for (const article of articles) {
    const category = toUrlCategory(article.category)
    if (!category) continue
    for (const locale of article.locales) {
      populatedArticleCategories.add(`${locale}:${category}`)
    }
  }

  // marketing + articles hub/category per locale
  for (const l of LOCALES) {
    for (const p of MARKETING_PATHS) {
      out.push({ url: `${SITE_URL}/${l}${p}`, changeFrequency: 'weekly', priority: p === '' ? 0.8 : 0.5 })
    }
    out.push({ url: `${SITE_URL}/${l}/articles`, changeFrequency: 'daily', priority: 0.6 })
    for (const category of URL_CATEGORIES) {
      if (!populatedArticleCategories.has(`${l}:${category}`)) continue
      out.push({ url: `${SITE_URL}/${l}/articles/${category}`, changeFrequency: 'daily', priority: 0.6 })
    }
  }

  // article detail: present locales only
  for (const a of articles) {
    const c = toUrlCategory(a.category)
    if (!c) continue
    const lastModified = a.lastmod ? new Date(a.lastmod) : undefined
    for (const l of a.locales) {
      out.push({ url: `${SITE_URL}/${l}/articles/${c}/${a.url}`, lastModified, changeFrequency: 'weekly', priority: 0.8 })
    }
  }

  // guides + creators: single-language content under every locale prefix (self-canonical + page-head hreflang)
  for (const g of guides) {
    const lastModified = g.lastmod ? new Date(g.lastmod) : undefined
    for (const l of LOCALES) {
      out.push({ url: `${SITE_URL}/${l}/g/${g.slug}`, lastModified, changeFrequency: 'weekly', priority: 0.7 })
    }
  }
  for (const cr of creators) {
    const lastModified = cr.lastmod ? new Date(cr.lastmod) : undefined
    for (const l of LOCALES) {
      out.push({ url: `${SITE_URL}/${l}/c/${cr.handle}`, lastModified, changeFrequency: 'weekly', priority: 0.6 })
    }
  }
  for (const m of merchants) {
    const lastModified = m.lastmod ? new Date(m.lastmod) : undefined
    for (const l of LOCALES) {
      out.push({ url: `${SITE_URL}/${l}/m/${m.slug}`, lastModified, changeFrequency: 'weekly', priority: 0.6 })
    }
  }
  for (const e of experiences) {
    const lastModified = e.lastmod ? new Date(e.lastmod) : undefined
    for (const l of LOCALES) {
      out.push({ url: `${SITE_URL}/${l}/experiences/${e.slug}`, lastModified, changeFrequency: 'weekly', priority: 0.7 })
    }
  }
  for (const s of sessions) {
    const lastModified = s.lastmod ? new Date(s.lastmod) : undefined
    for (const l of LOCALES) {
      out.push({ url: `${SITE_URL}/${l}/sessions/${s.slug}`, lastModified, changeFrequency: 'weekly', priority: 0.6 })
    }
  }
  for (const d of destinations) {
    const lastModified = d.lastmod ? new Date(d.lastmod) : undefined
    for (const l of LOCALES) {
      out.push({ url: `${SITE_URL}/${l}/destinations/${d.slug}`, lastModified, changeFrequency: 'weekly', priority: 0.6 })
    }
  }
  return out
}

// Next calls this once to learn the shard ids, then sitemap({id}) per shard. Rebuilding
// the list (here for the count, then once per shard) is the accepted cost of having no
// cheap total-count API; the 6h revalidate amortises it.
export async function generateSitemaps(): Promise<{ id: number }[]> {
  const total = (await buildAllSitemapEntries()).length
  const count = Math.max(1, Math.ceil(total / SITEMAP_CHUNK))
  return Array.from({ length: count }, (_, id) => ({ id }))
}

// Next 16 passes the shard id as a Promise that resolves to a STRING (the filename
// without `.xml`), so await + numeric-coerce before slicing. `id` is absent only when
// called directly (e.g. tests) → return the whole set.
export default async function sitemap(
  { id }: { id?: number | string | Promise<number | string> } = {},
): Promise<MetadataRoute.Sitemap> {
  const all = await buildAllSitemapEntries()
  const resolved = await id
  if (resolved === undefined || resolved === null) return all
  const shard = Number(resolved)
  if (!Number.isFinite(shard)) return all
  return all.slice(shard * SITEMAP_CHUNK, (shard + 1) * SITEMAP_CHUNK)
}
