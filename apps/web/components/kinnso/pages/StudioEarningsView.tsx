import React from 'react'
import { MissionStatusBadge } from '@/components/kinnso/MissionStatusBadge'
import { ReceiptRow, TicketCard, TicketDivider } from '@/components/kinnso/MarketPassport'
import type { Messages } from '@/lib/i18n/messages/en'
import type { Locale } from '@/lib/i18n/config'
import type { CreatorEarningsSummary, CreatorPayoutBatch } from '@/lib/missions/earnings-summary'

type StudioEarningsViewProps = {
  t: Messages['studioEarnings']
  locale: Locale
  data: CreatorEarningsSummary
  payoutBatches: CreatorPayoutBatch[]
}

function Section({
  heading,
  note,
  isEmpty,
  emptyLabel,
  children,
}: {
  heading: string
  note?: string
  isEmpty: boolean
  emptyLabel: string
  children: React.ReactNode
}) {
  return (
    <section className="mt-8">
      <h2 className="text-lg font-black text-kinnso-ink">{heading}</h2>
      {note && <p className="mt-1 text-sm text-kinnso-muted">{note}</p>}
      {isEmpty ? (
        <p className="mt-3 text-sm text-kinnso-muted">{emptyLabel}</p>
      ) : (
        <TicketCard className="mt-3 overflow-x-auto p-0">{children}</TicketCard>
      )}
    </section>
  )
}

/** `colSpan` must match the table's real column count — the four tables differ (4 / 3 / 3 / 3). */
function Rows({ colSpan, children }: { colSpan: number; children: React.ReactNode[] }) {
  return (
    <tbody>
      {children.map((row, i) => (
        <React.Fragment key={i}>
          {i > 0 && (
            <tr aria-hidden="true">
              <td colSpan={colSpan} className="p-0">
                <TicketDivider />
              </td>
            </tr>
          )}
          {row}
        </React.Fragment>
      ))}
    </tbody>
  )
}

export function StudioEarningsView({ t, locale, data, payoutBatches }: StudioEarningsViewProps) {
  const { missions, bookings, tracked, totals } = data

  return (
    <main className="k-container py-10">
      <h1 className="text-3xl font-black text-kinnso-ink">{t.heading}</h1>
      <p className="mt-2 text-sm text-kinnso-muted">{t.subtitle}</p>

      {totals.length > 0 && (
        <div className="mt-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {totals.map((total) => (
            <TicketCard key={total.currency} className="p-5">
              <p className="text-sm font-bold text-kinnso-ink">{total.currency}</p>
              <dl className="mt-3 space-y-1">
                <ReceiptRow label={t.paid} value={total.paid.toLocaleString()} tone="positive" />
                <ReceiptRow label={t.pending} value={total.pending.toLocaleString()} />
              </dl>
            </TicketCard>
          ))}
        </div>
      )}

      <Section heading={t.missionsHeading} isEmpty={missions.length === 0} emptyLabel={t.missionsEmpty}>
        <table className="w-full text-left text-sm">
          <thead className="text-xs uppercase text-kinnso-muted">
            <tr>
              <th scope="col" className="py-2 pr-4 pl-5 font-semibold">{t.colMission}</th>
              <th scope="col" className="py-2 pr-4 font-semibold">{t.colType}</th>
              <th scope="col" className="py-2 pr-4 font-semibold">{t.colAmount}</th>
              <th scope="col" className="py-2 pr-5 font-semibold">{t.colStatus}</th>
            </tr>
          </thead>
          <Rows colSpan={4}>
            {missions.map((item) => (
              <tr key={item.id}>
                <td className="py-2 pr-4 pl-5 font-medium text-kinnso-ink">{item.missionTitle}</td>
                <td className="py-2 pr-4 capitalize text-kinnso-muted">{item.missionType.replaceAll('_', ' ')}</td>
                <td className="py-2 pr-4 tabular-nums text-kinnso-ink">{item.currency} {item.amount.toLocaleString()}</td>
                <td className="py-2 pr-5">
                  <MissionStatusBadge status={item.payoutStatus === 'paid' ? t.paid : t.pending} />
                </td>
              </tr>
            ))}
          </Rows>
        </table>
      </Section>

      <Section heading={t.bookingsHeading} isEmpty={bookings.length === 0} emptyLabel={t.bookingsEmpty}>
        <table className="w-full text-left text-sm">
          <thead className="text-xs uppercase text-kinnso-muted">
            <tr>
              <th scope="col" className="py-2 pr-4 pl-5 font-semibold">{t.colExperience}</th>
              <th scope="col" className="py-2 pr-4 font-semibold">{t.colAmount}</th>
              <th scope="col" className="py-2 pr-5 font-semibold">{t.colStatus}</th>
            </tr>
          </thead>
          <Rows colSpan={3}>
            {bookings.map((item) => (
              <tr key={item.id}>
                <td className="py-2 pr-4 pl-5 font-medium text-kinnso-ink">{item.experienceTitle}</td>
                <td className="py-2 pr-4 tabular-nums text-kinnso-ink">{item.currency} {item.amount.toLocaleString()}</td>
                <td className="py-2 pr-5">
                  <MissionStatusBadge status={item.payoutStatus === 'paid' ? t.paid : t.pending} />
                </td>
              </tr>
            ))}
          </Rows>
        </table>
      </Section>

      <Section
        heading={t.trackedHeading}
        note={t.trackedNote}
        isEmpty={tracked.length === 0}
        emptyLabel={t.trackedEmpty}
      >
        <table className="w-full text-left text-sm">
          <thead className="text-xs uppercase text-kinnso-muted">
            <tr>
              <th scope="col" className="py-2 pr-4 pl-5 font-semibold">{t.colMission}</th>
              <th scope="col" className="py-2 pr-4 font-semibold">{t.colGross}</th>
              <th scope="col" className="py-2 pr-5 font-semibold">{t.colState}</th>
            </tr>
          </thead>
          <Rows colSpan={3}>
            {tracked.map((item) => (
              <tr key={item.id}>
                <td className="py-2 pr-4 pl-5 font-medium text-kinnso-ink">{item.missionTitle}</td>
                <td className="py-2 pr-4 tabular-nums text-kinnso-ink">{item.currency} {item.grossAmount.toLocaleString()}</td>
                <td className="py-2 pr-5 capitalize text-kinnso-muted">{item.eventState.replaceAll('_', ' ')}</td>
              </tr>
            ))}
          </Rows>
        </table>
      </Section>

      <Section
        heading={t.payoutBatchesHeading}
        isEmpty={payoutBatches.length === 0}
        emptyLabel={t.payoutBatchesEmpty}
      >
        <table className="w-full text-left text-sm">
          <thead className="text-xs uppercase text-kinnso-muted">
            <tr>
              <th scope="col" className="py-2 pr-4 pl-5 font-semibold">{t.colAmount}</th>
              <th scope="col" className="py-2 pr-4 font-semibold">{t.colStatus}</th>
              <th scope="col" className="py-2 pr-5 font-semibold">{t.colTarget}</th>
            </tr>
          </thead>
          <Rows colSpan={3}>
            {payoutBatches.map((b) => (
              <tr key={b.id}>
                <td className="py-2 pr-4 pl-5 tabular-nums text-kinnso-ink">{b.currency} {b.amount.toLocaleString()}</td>
                <td className="py-2 pr-4">
                  <MissionStatusBadge status={b.status === 'paid' ? t.paid : b.status === 'cancelled' ? t.batchCancelled : t.pending} />
                </td>
                <td className="py-2 pr-5 text-kinnso-muted">{new Date(b.targetAt).toLocaleDateString(locale)}</td>
              </tr>
            ))}
          </Rows>
        </table>
      </Section>
    </main>
  )
}
