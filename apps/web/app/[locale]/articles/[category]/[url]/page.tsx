import { notFound } from 'next/navigation'
import type { Metadata } from 'next'
import Link from 'next/link'
import {
  getArticleDetail,
  getIndexableArticleLocales,
  getYouMayLike,
  getStaticArticleParams,
} from '@/lib/articles/queries'
import { getDictionary } from '@/lib/i18n/dictionaries'
import { isLocale, toDbCategory, toUrlCategory, type Locale } from '@/lib/i18n/config'
import { buildArticleMetadata, SITE_URL } from '@/lib/seo/metadata'
import { resolveArticleIndexing } from '@/lib/seo/article-indexability'
import { articleJsonLd, faqJsonLd, breadcrumbJsonLd } from '@/lib/seo/jsonld'
import { ArticleBlockRenderer } from '@/components/ArticleBlockRenderer'
import { ArticleGuideLinks } from '@/components/kinnso/articles/ArticleGuideLinks'
import { ArticleExperienceLinks } from '@/components/kinnso/articles/ArticleExperienceLinks'
import { ArticleToc } from '@/components/ArticleToc'
import { ArticleCard } from '@/components/ArticleCard'
import { ViewPing } from '@/components/ViewPing'
import { JsonLd } from '@/components/JsonLd'
import { EntityMedia } from '@/components/kinnso/media/EntityMedia'
import { isApprovedEntityMediaUrl } from '@/lib/media/entity-media'
import { getPostDirectory } from '@/lib/articles/blocks'
import { resolveConfiguredProductState } from '@/lib/product-state'
import { AnalyticsEntityView } from '@/components/kinnso/analytics/AnalyticsEntityView'

// 45 min matches the legacy article-detail cache TTL, but the parent locale
// layout's 300 is lower and Next takes the lowest across the route, so the
// effective interval is about five minutes. See app/[locale]/layout.tsx.
export const revalidate = 2700
export const dynamicParams = true

export async function generateStaticParams() {
  return getStaticArticleParams()
}

type Params = Promise<{ locale: string; category: string; url: string }>

export async function generateMetadata(
  { params }: { params: Params },
): Promise<Metadata> {
  const { locale, category, url } = await params
  if (!isLocale(locale) || !toDbCategory(category)) return {}
  const [article, indexableLocales] = await Promise.all([
    getArticleDetail(category, url, locale),
    getIndexableArticleLocales(url),
  ])
  if (!article?.translation || !isLocale(article.translation.locale)) return {}
  const indexing = resolveArticleIndexing({
    requestedLocale: locale,
    resolvedLocale: article.translation.locale,
    indexableLocales,
  })
  const approvedOgImage = [
    article.translation.og_image,
    article.thumbnails[0],
  ].find(isApprovedEntityMediaUrl) ?? null
  return buildArticleMetadata({
    urlCategory: category as 'destinations' | 'dining' | 'shopping',
    url,
    locale,
    resolvedLocale: article.translation.locale,
    indexing,
    title: article.translation.title,
    metaTitle: article.translation.meta_title,
    summary: article.translation.summary,
    metaDescription: article.translation.meta_description,
    ogImage: approvedOgImage,
    publishedAt: article.published_at,
    editAt: article.edit_at,
  })
}
export default async function ArticleDetailPage({ params }: { params: Params }) {
  const { locale, category, url } = await params
  if (!isLocale(locale) || !toDbCategory(category)) notFound()
  const loc = locale as Locale
  const [a, indexableLocales] = await Promise.all([
    getArticleDetail(category, url, loc),
    getIndexableArticleLocales(url),
  ])
  if (!a?.translation || !isLocale(a.translation.locale)) notFound()
  const indexing = resolveArticleIndexing({
    requestedLocale: loc,
    resolvedLocale: a.translation.locale,
    indexableLocales,
  })
  const canonicalLocale = indexing.canonicalLocale ?? loc

  const dict = await getDictionary(loc)
  const { bookingLive } = resolveConfiguredProductState()
  const directory = getPostDirectory(a.translation.content)
  const youMayLike = await getYouMayLike(a.id, loc, 5)

  const canonical = `${SITE_URL}/${canonicalLocale}/articles/${category}/${url}`
  const approvedThumbnails = a.thumbnails.filter(isApprovedEntityMediaUrl)
  const ld: Record<string, unknown>[] = [
    articleJsonLd({
      headline: a.translation.meta_title ?? a.translation.title ?? '',
      description: (a.translation.meta_description?.trim() || a.translation.summary) ?? '',
      url: canonical, images: approvedThumbnails, publishedAt: a.published_at,
      modifiedAt: a.edit_at, authorName: a.author?.name ?? null, locale: a.translation.locale,
    }),
    breadcrumbJsonLd([
      { name: dict.breadcrumb.home, url: `${SITE_URL}/${loc}` },
      { name: dict.breadcrumb.articles, url: `${SITE_URL}/${loc}/articles` },
      { name: dict.categories[category as 'destinations' | 'dining' | 'shopping'], url: `${SITE_URL}/${loc}/articles/${category}` },
      { name: a.translation.title ?? '', url: canonical },
    ]),
  ]
  const faqLd = indexing.index ? faqJsonLd(a.faqs) : null
  if (faqLd) ld.push(faqLd)

  return (
    <div className="k2-container py-8">
      <JsonLd data={ld} />
      <ViewPing url={url} />
      <AnalyticsEntityView locale={loc} routeKey="article_detail" entityType="article" entityId={a.id} />

      <nav className="text-sm text-kinnso-muted mb-4" aria-label="breadcrumb">
        <Link href={`/${loc}`}>{dict.breadcrumb.home}</Link> ·{' '}
        <Link href={`/${loc}/articles`}>{dict.breadcrumb.articles}</Link> ·{' '}
        <Link href={`/${loc}/articles/${category}`}>{dict.categories[category as 'destinations' | 'dining' | 'shopping']}</Link>
        {' '}·{' '}
        <span aria-current="page">{a.translation.title}</span>
      </nav>

      <header className="mb-6">
        <h1 className="k2-display text-3xl md:text-4xl font-semibold text-kinnso-ink">{a.translation.title}</h1>
        {a.translation.locale !== loc && (
          <p className="mt-2 rounded-[4px] border border-kinnso-edge bg-kinnso-cream2 px-3 py-2 text-sm text-kinnso-ink">
            {dict.article.fallbackNotice}
          </p>
        )}
        {a.author && <p className="text-kinnso-muted mt-2">{dict.article.by} {a.author.name}</p>}
      </header>

      <div className="grid gap-8 lg:grid-cols-[1fr_260px]">
        <article>
          <EntityMedia src={a.thumbnails[0]} title={a.translation.title ?? url} sizes="(min-width: 1024px) 1152px, 100vw" priority className="mb-6 aspect-[16/9] w-full rounded-card" />
          <ArticleBlockRenderer blocks={a.translation.content} />
          <ArticleGuideLinks locale={loc} regions={a.regions ?? []} articleId={a.id} t={dict.article} />
          <ArticleExperienceLinks locale={loc} regions={a.regions ?? []} articleId={a.id} t={dict.article} bookingLive={bookingLive} />

          {a.faqs.length > 0 && (
            <section className="mt-10">
              <h2 className="text-2xl font-bold mb-4">{a.translation.faq_title || dict.article.faqTitle}</h2>
              <dl className="space-y-4">
                {a.faqs.map((f, i) => (
                  <div key={`${f.question}-${i}`} className="rounded-card border border-kinnso-cream2 p-4">
                    <dt className="font-semibold">{f.question}</dt>
                    <dd className="text-kinnso-muted mt-1">{f.answer}</dd>
                  </div>
                ))}
              </dl>
            </section>
          )}
        </article>

        <aside className="hidden lg:block">
          <div className="sticky top-24">
            <ArticleToc items={directory} label={dict.article.tableOfContents} />
          </div>
        </aside>
      </div>

      {youMayLike.length > 0 && (
        <section className="mt-12">
          <h2 className="text-2xl font-bold mb-4">{dict.article.youMayLike}</h2>
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {youMayLike.map((r) => {
              const c = toUrlCategory(r.category)
              if (!c) return null
              return (
                <ArticleCard key={r.url} href={`/${loc}/articles/${c}/${r.url}`}
                             title={r.title ?? ''} thumbnail={r.thumbnails[0]} />
              )
            })}
          </div>
        </section>
      )}
    </div>
  )
}
