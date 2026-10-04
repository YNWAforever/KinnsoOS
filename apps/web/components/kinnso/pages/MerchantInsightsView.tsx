'use client'

import type en from '@/lib/i18n/messages/en'
import type { MerchantInsights } from '@/lib/insights/merchant'

export function MerchantInsightsView({
  t,
  data,
}: {
  t: (typeof en)['insights']
  data: MerchantInsights
}) {
  const acceptance =
    data.inviteAcceptRate === null ? t.notApplicable : `${Math.round(data.inviteAcceptRate * 100)}%`

  return (
    <main className="mx-auto max-w-4xl space-y-8 px-4 py-8">
      <header className="space-y-1">
        <h1 className="text-2xl font-semibold">{t.merchantTitle}</h1>
        <p className="text-sm text-muted-foreground">{t.merchantSubtitle}</p>
      </header>

      <section className="grid grid-cols-2 gap-4 sm:grid-cols-4">
        <Stat label={t.missionsPublished} value={String(data.missionsPublished)} />
        <Stat label={t.participants} value={String(data.totals.participants)} />
        <Stat label={t.inviteAcceptRate} value={acceptance} />
        <Stat label={t.deliveredWork} value={String(data.totals.approvedSubmissions)} />
      </section>

      <section className="rounded-lg border p-5">
        <h2 className="mb-3 text-sm font-medium">{t.perMissionTitle}</h2>
        {data.perMission.length > 0 ? (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead className="text-muted-foreground">
                <tr>
                  <th scope="col" className="py-2 pr-2 font-medium">{t.colMission}</th>
                  <th scope="col" className="py-2 px-2 text-right font-medium">{t.colInvited}</th>
                  <th scope="col" className="py-2 px-2 text-right font-medium">{t.colApplied}</th>
                  <th scope="col" className="py-2 px-2 text-right font-medium">{t.colActive}</th>
                  <th scope="col" className="py-2 px-2 text-right font-medium">{t.colRejected}</th>
                  <th scope="col" className="py-2 pl-2 text-right font-medium">{t.colDelivered}</th>
                </tr>
              </thead>
              <tbody>
                {data.perMission.map((r) => (
                  <tr key={r.missionId} className="border-t">
                    <td className="py-2 pr-2">{r.title}</td>
                    <td className="py-2 px-2 text-right tabular-nums">{r.invited}</td>
                    <td className="py-2 px-2 text-right tabular-nums">{r.applied}</td>
                    <td className="py-2 px-2 text-right tabular-nums">{r.active}</td>
                    <td className="py-2 px-2 text-right tabular-nums">{r.rejected}</td>
                    <td className="py-2 pl-2 text-right tabular-nums">{r.approvedSubmissions}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <p className="text-sm text-muted-foreground">{t.merchantEmpty}</p>
        )}
      </section>

      <section className="rounded-lg border p-5">
        <h2 className="mb-3 text-sm font-medium">{t.visitsDrivenTitle}</h2>
        {data.visitsDriven.length > 0 ? (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead className="text-muted-foreground">
                <tr>
                  <th scope="col" className="py-2 pr-2 font-medium">{t.colCreator}</th>
                  <th scope="col" className="py-2 px-2 font-medium">{t.colGuide}</th>
                  <th scope="col" className="py-2 px-2 text-right font-medium">{t.colRedemptions}</th>
                  <th scope="col" className="py-2 pl-2 text-right font-medium">{t.colAttributedBookings}</th>
                </tr>
              </thead>
              <tbody>
                {data.visitsDriven.map((r, i) => (
                  <tr key={`${r.creatorId}-${r.guideId ?? i}`} className="border-t">
                    <td className="py-2 pr-2">{r.creatorName ?? t.unnamed}</td>
                    <td className="py-2 px-2">{r.guideTitle ?? t.notApplicable}</td>
                    <td className="py-2 px-2 text-right tabular-nums">{r.redemptions}</td>
                    <td className="py-2 pl-2 text-right tabular-nums">{r.attributedBookings}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <p className="text-sm text-muted-foreground">{t.visitsDrivenEmpty}</p>
        )}
      </section>
    </main>
  )
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg border p-4">
      <p className="text-sm text-muted-foreground">{label}</p>
      <p className="text-2xl font-semibold tabular-nums">{value}</p>
    </div>
  )
}
