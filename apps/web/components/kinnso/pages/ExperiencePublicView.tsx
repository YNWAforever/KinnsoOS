// apps/web/components/kinnso/pages/ExperiencePublicView.tsx
import Link from 'next/link'
import { Bookmark } from 'lucide-react'
import { Eyebrow } from '@/components/kinnso/editorial/Eyebrow'
import { BookingWidget } from '@/components/kinnso/pages/BookingWidget'
import { FeatureInterestForm } from '@/components/kinnso/FeatureInterestForm'
import { ExperienceSaveButton } from '@/components/kinnso/ExperienceSaveButton'
import { EntityMedia } from '@/components/kinnso/media/EntityMedia'
import type { PublicExperience } from '@/lib/experiences/public-queries'
import type { PublicAvailability } from '@/lib/experiences/public-availability-queries'
import type { RatingAggregate, Review } from '@/lib/reviews/types'
import type { Locale } from '@/lib/i18n/config'
import type { Messages } from '@/lib/i18n/messages/en'

export function ExperiencePublicView({
  locale, t, bookingT, featureInterestT, bookingLive, reviewsT, experienceSaveT, experience, availability, viewerEmail, viewerId, isSaved, rating, reviews, sourceSurface, guideSlug,
}: {
  locale: Locale
  t: Messages['experiencePublic']
  bookingT: Messages['booking']
  featureInterestT: Messages['featureInterest']
  bookingLive: boolean
  reviewsT: Messages['reviews']
  experienceSaveT: Messages['experienceSave']
  experience: PublicExperience
  availability: PublicAvailability[]
  viewerEmail: string | null
  viewerId: string | null
  isSaved: boolean
  rating: RatingAggregate | null
  reviews: Review[]
  sourceSurface?: string
  guideSlug?: string
}) {
  const p = (path: string) => `/${locale}${path}`
  return (
    <article className="k2-container py-8 md:py-12">
      <section className="overflow-hidden rounded-xl bg-white shadow-kinnso">
        <div className="relative aspect-[16/9] w-full bg-kinnso-ink">
          <EntityMedia
            src={experience.coverUrl}
            title={experience.title}
            location={experience.city}
            sizes="(min-width: 1024px) 1152px, 100vw"
            priority
            className="absolute inset-0"
          />
          <div className="absolute inset-0 bg-gradient-to-t from-black/70 to-black/10" />
          <Eyebrow className="absolute left-4 top-4 rounded-[3px] bg-white/90 px-3 py-1">{experience.city}</Eyebrow>
          <div className="absolute right-4 top-4">
            <ExperienceSaveButton locale={locale} experienceId={experience.id} initialSaved={isSaved} signedIn={!!viewerId} t={experienceSaveT} />
          </div>
        </div>
        <div className="p-6 md:p-8">
          <h1 className="k2-display max-w-3xl text-2xl font-semibold leading-tight text-kinnso-ink md:text-4xl">{experience.title}</h1>
          <div className="mt-3 flex flex-wrap items-center gap-3 text-sm text-kinnso-muted">
            <span className="inline-flex items-center gap-1 tabular-nums">
              <Bookmark className="h-4 w-4" aria-hidden="true" />
              {experience.savesCount.toLocaleString()}
            </span>
          </div>
          <p className="mt-2 text-sm text-kinnso-muted">
            {t.hostedBy}{' '}
            <Link href={p(`/m/${experience.merchant.slug}`)} className="font-semibold text-kinnso-orangeDark hover:underline">
              {experience.merchant.companyName}
            </Link>
          </p>
        </div>
      </section>

      <section className="mt-6 grid gap-5 md:grid-cols-[1fr_320px]">
        <div className="rounded-lg bg-white p-6">
          {experience.summary ? <p className="text-kinnso-ink/80">{experience.summary}</p> : null}
          {experience.description ? <p className="mt-4 leading-relaxed text-kinnso-ink/70">{experience.description}</p> : null}
        </div>
        <div className="k2-card bg-kinnso-cream2 p-6">
          <p className="text-xs font-bold uppercase tracking-wide text-kinnso-muted">{t.priceLabel}</p>
          <p className="k2-display mt-1 text-2xl font-semibold text-kinnso-ink">{experience.currency} {experience.priceAmount.toLocaleString()}</p>
          {experience.durationMinutes ? (
            <p className="mt-3 text-sm text-kinnso-ink/70">{t.durationLabel}: {experience.durationMinutes} {t.minutesSuffix}</p>
          ) : null}
          {bookingLive ? (
            <BookingWidget locale={locale} t={bookingT} experience={experience} availability={availability} viewerEmail={viewerEmail} sourceSurface={sourceSurface} guideSlug={guideSlug} />
          ) : (
            <div className="mt-5">
              <FeatureInterestForm
                feature="booking"
                locale={locale}
                t={featureInterestT}
                analyticsEntityType="experience"
                analyticsEntityId={experience.id}
              />
            </div>
          )}
          <Link href={p(`/m/${experience.merchant.slug}`)} className="mt-4 inline-block text-sm font-semibold text-kinnso-orangeDark hover:underline">
            {t.backToMerchant} {experience.merchant.companyName}
          </Link>
        </div>
      </section>

      <section className="mt-6 rounded-lg bg-white p-6">
        <h2 className="text-base font-bold text-kinnso-ink">
          {rating
            ? `${reviewsT.ratingAverageLabel.replace('{average}', rating.average.toFixed(1))} · ${reviewsT.countLabel.replace('{count}', String(rating.count))}`
            : reviewsT.emptyState}
        </h2>
        {reviews.length === 0 ? null : (
          <ul className="mt-4 space-y-4">
            {reviews.map((r) => (
              <li key={r.id} className="border-t border-kinnso-cream2 pt-4 first:border-t-0 first:pt-0">
                <p className="text-sm font-semibold text-kinnso-ink">{reviewsT.anonymousReviewer} · {r.rating}/5</p>
                {r.body ? <p className="mt-1 text-sm text-kinnso-muted">{r.body}</p> : null}
              </li>
            ))}
          </ul>
        )}
      </section>
    </article>
  )
}

export default ExperiencePublicView
