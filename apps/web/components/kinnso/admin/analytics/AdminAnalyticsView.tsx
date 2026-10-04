import Link from 'next/link'
import type { TravellerAnalyticsReport } from '@/lib/admin/analytics-queries'
import type { AnalyticsDashboardFilters, AnalyticsHealthSummary } from '@/lib/admin/analytics-dashboard'
import { LOCALES, type Locale } from '@/lib/i18n/config'
import type { Messages } from '@/lib/i18n/messages/en'

type Props = {
  locale: Locale
  t: Messages['admin']
  filters: AnalyticsDashboardFilters
  report: TravellerAnalyticsReport | null
  error: 'unavailable' | null
  health: AnalyticsHealthSummary
}

const metricLabel = (t: Messages['admin'], key: string) => ({
  discovery_to_entity: t.analyticsMetricDiscoveryToEntity,
  entity_to_agent: t.analyticsMetricEntityToAgent,
  entity_to_cta: t.analyticsMetricEntityToCta,
  cta_to_waitlist_submitted: t.analyticsMetricCtaToWaitlist,
  cta_to_checkout_started: t.analyticsMetricCtaToCheckout,
  agent_start_rate: t.analyticsMetricAgentStart,
  signup_start_to_completion: t.analyticsMetricSignupCompletion,
  error_invalid: t.analyticsMetricErrorInvalid,
  error_rate_limited: t.analyticsMetricErrorRateLimited,
  error_unavailable: t.analyticsMetricErrorUnavailable,
  error_unknown: t.analyticsMetricErrorUnknown,
} as Record<string, string>)[key] ?? t.analyticsMetricUnknown

function href(locale: Locale, filters: AnalyticsDashboardFilters, patch: Partial<AnalyticsDashboardFilters>) {
  const next = { ...filters, ...patch }
  const query = new URLSearchParams({
    window: next.window,
    locale: next.locale,
    entity: next.entity,
    booking: next.booking,
  })
  return `/${locale}/admin/analytics?${query.toString()}`
}

export function AdminAnalyticsView({ locale, t, filters, report, error, health }: Props) {
  const rows = report?.rows ?? []
  const hasNoRows = report !== null && rows.length === 0
  const hasObservedZero = report !== null && rows.length > 0 && rows.every((row) => row.numerator === 0 && row.denominator === 0)
  const entityLabels = {
    guide: t.analyticsEntityGuide,
    experience: t.analyticsEntityExperience,
    creator: t.analyticsEntityCreator,
    article: t.analyticsEntityArticle,
  }
  const entityLabel = (value: string | null) => value === null
    ? t.analyticsNotApplicable
    : value in entityLabels ? entityLabels[value as keyof typeof entityLabels] : t.analyticsMetricUnknown
  const bookingLabel = (value: string) => value === 'on' ? t.analyticsBookingOn : value === 'off' ? t.analyticsBookingOff : t.analyticsMetricUnknown
  const localeLabel = (value: string) => (LOCALES as readonly string[]).includes(value) ? value : t.analyticsMetricUnknown
  const healthStatusLabel = {
    unavailable: t.analyticsHealthUnavailable,
    no_matching_rows: t.analyticsHealthNoMatching,
    observed_zero: t.analyticsHealthObservedZero,
    insufficient_sample: t.analyticsHealthInsufficient,
    available: t.analyticsHealthAvailable,
  }[health.status]
  const healthDescription = {
    unavailable: `${t.analyticsUnavailable} ${t.analyticsRetry}`,
    no_matching_rows: t.analyticsEmpty,
    observed_zero: t.analyticsObservedZero,
    insufficient_sample: t.analyticsInsufficientSample,
    available: t.analyticsOk,
  }[health.status]

  return (
    <main>
      <h1 className="k-display">{t.analyticsTitle}</h1>
      <p className="mt-2 text-kinnso-muted">{t.analyticsSubtitle}</p>
      <p className="mt-3 text-sm text-kinnso-muted">{t.analyticsUtcNote} {t.analyticsRetentionNote} {t.analyticsAttributionNote} {t.analyticsSampleFloorNote}</p>

      <section className="mt-6 rounded-xl border border-kinnso-ink/10 bg-white p-4" aria-labelledby="analytics-health-heading" aria-describedby="analytics-health-description">
        <h2 id="analytics-health-heading" className="text-sm font-bold text-kinnso-ink">{t.analyticsHealthTitle}</h2>
        <p role={health.status === 'unavailable' ? 'alert' : 'status'} className="mt-1 text-sm text-kinnso-muted">{t.analyticsHealthStatus}: {healthStatusLabel}</p>
        <dl className="mt-3 grid gap-2 text-sm sm:grid-cols-2">
          <div><dt className="text-kinnso-muted">{t.analyticsHealthReturnedRows}</dt><dd className="font-bold text-kinnso-ink">{health.returnedRows.toLocaleString(locale)}</dd></div>
          <div><dt className="text-kinnso-muted">{t.analyticsHealthOkRows}</dt><dd className="font-bold text-kinnso-ink">{health.okRows.toLocaleString(locale)}</dd></div>
          <div><dt className="text-kinnso-muted">{t.analyticsHealthInsufficientRows}</dt><dd className="font-bold text-kinnso-ink">{health.insufficientRows.toLocaleString(locale)}</dd></div>
          <div><dt className="text-kinnso-muted">{t.analyticsHealthObservedZeroRows}</dt><dd className="font-bold text-kinnso-ink">{health.observedZeroRows.toLocaleString(locale)}</dd></div>
        </dl>
        <p id="analytics-health-description" className="mt-3 text-sm text-kinnso-muted">{healthDescription}</p>
      </section>

      <nav className="mt-6 grid gap-4" aria-label={t.analyticsFilters}>
        <section role="group" aria-label={t.analyticsWindow}>
          <p className="text-sm font-bold text-kinnso-ink">{t.analyticsWindow}</p>
          <div className="mt-2 flex flex-wrap gap-2">{(['7d', '24h'] as const).map((window) => (
            <Link key={window} href={href(locale, filters, { window })} aria-current={filters.window === window ? 'page' : undefined} className="rounded-lg px-3 py-2 text-sm font-bold text-kinnso-ink">{window === '7d' ? t.analyticsWindow7d : t.analyticsWindow24h}</Link>
          ))}</div>
        </section>
        <section role="group" aria-label={t.analyticsLocale}>
          <p className="text-sm font-bold text-kinnso-ink">{t.analyticsLocale}</p>
          <div className="mt-2 flex flex-wrap gap-2">{(['all', ...LOCALES] as const).map((value) => (
            <Link key={value} href={href(locale, filters, { locale: value })} aria-current={filters.locale === value ? 'page' : undefined} aria-label={value === 'all' ? `${t.analyticsLocale}: ${t.analyticsAll}` : undefined} className="rounded-lg px-3 py-2 text-sm font-bold text-kinnso-ink">{value === 'all' ? t.analyticsAll : value}</Link>
          ))}</div>
        </section>
        <section role="group" aria-label={t.analyticsEntityType}>
          <p className="text-sm font-bold text-kinnso-ink">{t.analyticsEntityType}</p>
          <div className="mt-2 flex flex-wrap gap-2">{(['all', 'guide', 'experience', 'creator', 'article'] as const).map((value) => (
            <Link key={value} href={href(locale, filters, { entity: value })} aria-current={filters.entity === value ? 'page' : undefined} aria-label={value === 'all' ? `${t.analyticsEntityType}: ${t.analyticsAll}` : undefined} className="rounded-lg px-3 py-2 text-sm font-bold text-kinnso-ink">{value === 'all' ? t.analyticsAll : entityLabels[value]}</Link>
          ))}</div>
        </section>
        <section role="group" aria-label={t.analyticsBookingState}>
          <p className="text-sm font-bold text-kinnso-ink">{t.analyticsBookingState}</p>
          <div className="mt-2 flex flex-wrap gap-2">{(['all', 'off', 'on'] as const).map((value) => (
            <Link key={value} href={href(locale, filters, { booking: value })} aria-current={filters.booking === value ? 'page' : undefined} aria-label={value === 'all' ? `${t.analyticsBookingState}: ${t.analyticsAll}` : undefined} className="rounded-lg px-3 py-2 text-sm font-bold text-kinnso-ink">{value === 'all' ? t.analyticsAll : bookingLabel(value)}</Link>
          ))}</div>
        </section>
      </nav>

      {error ? <p className="mt-8 text-sm text-red-600">{t.analyticsUnavailable} {t.analyticsRetry}</p>
        : hasNoRows ? <p className="mt-8 text-sm text-kinnso-muted">{t.analyticsEmpty}</p>
          : (
            <>
              {hasObservedZero ? <p className="mt-8 text-sm text-kinnso-muted">{t.analyticsObservedZero}</p> : null}
              <div className="mt-8 overflow-x-auto rounded-xl border border-kinnso-ink/10 bg-white">
                <table className="min-w-full text-left text-sm">
                  <caption className="sr-only">{t.analyticsTableCaption}</caption>
                  <thead><tr>
                    {[t.analyticsMetric, t.analyticsLocale, t.analyticsEntityType, t.analyticsBookingState, t.analyticsNumerator, t.analyticsDenominator, t.analyticsRate, t.analyticsStatus].map((label) => (
                      <th key={label} scope="col" className="px-4 py-3 font-bold text-kinnso-ink">{label}</th>
                    ))}
                  </tr></thead>
                  <tbody>
                    {rows.map((row) => (
                      <tr key={`${row.metricKey}-${row.locale}-${row.entityType ?? 'none'}-${row.bookingState}`} className="border-t border-kinnso-ink/10">
                        <td className="px-4 py-3">{metricLabel(t, row.metricKey)}</td>
                        <td className="px-4 py-3">{localeLabel(row.locale)}</td>
                        <td className="px-4 py-3">{entityLabel(row.entityType)}</td>
                        <td className="px-4 py-3">{bookingLabel(row.bookingState)}</td>
                        <td className="px-4 py-3">{row.numerator.toLocaleString(locale)}</td>
                        <td className="px-4 py-3">{row.sampleCount.toLocaleString(locale)}</td>
                        <td className="px-4 py-3">{row.status === 'ok' && row.rate !== null ? `${Math.round(row.rate * 10000) / 100}%` : '—'}</td>
                        <td className="px-4 py-3">{row.status === 'ok' ? t.analyticsOk : <><span>{t.analyticsInsufficientSample}</span> ({row.sampleCount.toLocaleString(locale)})</>}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </>
          )}
    </main>
  )
}
