import type { ReactNode } from 'react'
import { htmlLang, type Locale } from '@/lib/i18n/config'
import type { Messages } from '@/lib/i18n/messages/en'
import type { PublishedGuideSource } from '@/lib/guides/public-source'

type Copy = Messages['guideSource']

/**
 * Same summary / itinerary boundary as Journeys' public guide source card.
 * A reading summary never receives an adopt control and never lists stops.
 */
export function GuideSourceBoundary({
  locale,
  view,
  t,
  planning,
}: {
  locale: Locale
  view: PublishedGuideSource
  t: Copy
  planning?: ReactNode
}) {
  if (view.kind === 'unavailable') {
    return <p role="status" className="text-sm text-kinnso-muted">{t.unavailable}</p>
  }

  const source = view.source
  const showCounts = view.kind === 'itinerary' && source.dayCount !== null && source.stopCount !== null

  return (
    <div>
      <aside lang={htmlLang(locale)} aria-label={t.label} className="border-b border-kinnso-edge pb-5">
        <h2 className="text-base font-bold text-kinnso-ink">{t.label}</h2>
        <p className="mt-2 text-sm text-kinnso-ink">
          {view.kind === 'itinerary' ? t.itineraryKind : t.summaryKind}
        </p>
        <dl className="mt-3 grid grid-cols-[max-content_1fr] gap-x-4 gap-y-1 text-sm">
          <dt className="font-semibold text-kinnso-ink">{t.author}</dt>
          <dd className="text-kinnso-muted">{source.authorName ?? t.unknown}</dd>
          <dt className="font-semibold text-kinnso-ink">{t.version}</dt>
          <dd className="text-kinnso-muted">{source.version === null ? t.unknown : `v${source.version}`}</dd>
          <dt className="font-semibold text-kinnso-ink">{t.publishedAt}</dt>
          <dd className="text-kinnso-muted">
            {source.publishedAt ? <time dateTime={source.publishedAt}>{source.publishedAt}</time> : t.unknown}
          </dd>
          {showCounts ? (
            <>
              <dt className="font-semibold text-kinnso-ink">{t.daysStops}</dt>
              <dd className="text-kinnso-muted">{source.dayCount} / {source.stopCount}</dd>
            </>
          ) : null}
          <dt className="font-semibold text-kinnso-ink">{t.originalLanguage}</dt>
          <dd className="text-kinnso-muted">{t.unknown}</dd>
          <dt className="font-semibold text-kinnso-ink">{t.verificationDate}</dt>
          <dd className="text-kinnso-muted">{t.unknown}</dd>
        </dl>
        <p className="mt-3 text-sm text-kinnso-muted">{t.disclaimer}</p>
      </aside>
      {view.kind === 'summary' ? (
        <div className="mt-4">
          {view.summary ? <p className="text-sm leading-relaxed text-kinnso-ink" lang="">{view.summary}</p> : null}
          <p className="mt-3 text-sm text-kinnso-muted">{t.summaryNoAdopt}</p>
          <p className="mt-2 text-sm text-kinnso-muted">{t.summaryInspiration}</p>
        </div>
      ) : (
        <>
          <div className="mt-4" lang="">
            {view.days.map((day) => (
              <section key={day.id} className="mt-4">
                {day.title ? <h3 className="text-base font-bold text-kinnso-ink">{day.title}</h3> : null}
                {day.stops.map((stop) => (
                  <section key={stop.id} className="mt-3">
                    {stop.title ? <h4 className="text-sm font-semibold text-kinnso-ink">{stop.title}</h4> : null}
                    {stop.description ? <p className="mt-1 text-sm text-kinnso-muted">{stop.description}</p> : null}
                  </section>
                ))}
              </section>
            ))}
          </div>
          {planning}
        </>
      )}
    </div>
  )
}
