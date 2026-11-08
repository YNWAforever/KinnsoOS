import type { ReactNode } from 'react'
import { htmlLang, type Locale } from '@/lib/i18n/config'
import type { Messages } from '@/lib/i18n/messages/en'
import type { PublishedGuideSource } from '@/lib/guides/public-source'

type Copy = Messages['guideSource']

function SourceFact({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="min-w-0">
      <dt className="m-0 font-semibold text-kinnso-ink [overflow-wrap:anywhere]">{label}</dt>
      <dd className="m-0 min-w-0 text-kinnso-muted [overflow-wrap:anywhere]">{children}</dd>
    </div>
  )
}

/**
 * Same summary / itinerary boundary as Journeys' public guide source card.
 * A reading summary never receives an adopt control and never lists stops.
 * Facts stack, and values may break, so a long label or timestamp cannot
 * widen the page. The browser's default dd margin is reset for the same reason.
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
    <div className="min-w-0">
      <aside lang={htmlLang(locale)} aria-label={t.label} className="min-w-0 border-b border-kinnso-edge pb-5">
        <h2 className="text-base font-bold text-kinnso-ink [overflow-wrap:anywhere]">{t.label}</h2>
        <p className="mt-2 text-sm text-kinnso-ink [overflow-wrap:anywhere]">
          {view.kind === 'itinerary' ? t.itineraryKind : t.summaryKind}
        </p>
        <dl className="mt-3 min-w-0 space-y-2 text-sm">
          <SourceFact label={t.author}>{source.authorName ?? t.unknown}</SourceFact>
          <SourceFact label={t.version}>{source.version === null ? t.unknown : `v${source.version}`}</SourceFact>
          <SourceFact label={t.publishedAt}>
            {source.publishedAt ? <time dateTime={source.publishedAt}>{source.publishedAt}</time> : t.unknown}
          </SourceFact>
          {showCounts ? <SourceFact label={t.daysStops}>{source.dayCount} / {source.stopCount}</SourceFact> : null}
          <SourceFact label={t.originalLanguage}>{t.unknown}</SourceFact>
          <SourceFact label={t.verificationDate}>{t.unknown}</SourceFact>
        </dl>
        <p className="mt-3 text-sm text-kinnso-muted [overflow-wrap:anywhere]">{t.disclaimer}</p>
      </aside>
      {view.kind === 'summary' ? (
        <div className="mt-4 min-w-0">
          {view.summary ? <p className="text-sm leading-relaxed text-kinnso-ink [overflow-wrap:anywhere]" lang="">{view.summary}</p> : null}
          <p className="mt-3 text-sm text-kinnso-muted [overflow-wrap:anywhere]">{t.summaryNoAdopt}</p>
          <p className="mt-2 text-sm text-kinnso-muted [overflow-wrap:anywhere]">{t.summaryInspiration}</p>
        </div>
      ) : (
        <>
          <div className="mt-4 min-w-0" lang="">
            {view.days.map((day) => (
              <section key={day.id} className="mt-4 min-w-0">
                {day.title ? <h3 className="text-base font-bold text-kinnso-ink [overflow-wrap:anywhere]">{day.title}</h3> : null}
                {day.stops.map((stop) => (
                  <section key={stop.id} className="mt-3 min-w-0">
                    {stop.title ? <h4 className="text-sm font-semibold text-kinnso-ink [overflow-wrap:anywhere]">{stop.title}</h4> : null}
                    {stop.description ? <p className="mt-1 text-sm text-kinnso-muted [overflow-wrap:anywhere]">{stop.description}</p> : null}
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
